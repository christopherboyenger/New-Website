import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { site } from "@/config/site";
import { can, type Actor } from "@/domain/permissions";
import { newId } from "@/lib/ids";
import { recordAudit } from "../audit";
import { getCurrentSession, isSafeReturnPath } from "../auth/session";
import { requireOrgAction } from "../authz";
import { generateToken, tokenDigest } from "../crypto";
import { capability } from "../readiness";
import { getDb } from "../db/client";
import { memberships, oauthAttempts, organizations } from "../db/schema";
import { storeCredential } from "./credentials";
import { sensitiveBlocker } from "./guards";
import { findInstallation } from "./installations";
import { ProviderError, type IntegrationErrorCategory } from "./provider-error";
import { oauthAdapter } from "./providers";
import { metaCapabilityScopes, type MetaCapability } from "./providers/meta";
import type { OAuthAdapter, OAuthGrant, OAuthProvider, OAuthTokenSet } from "./providers/types";
import { integrationInstallations } from "../db/schema";

/**
 * OAuth connection flow (production-integration-contracts.md §4):
 * start → one-use state (digest only) bound to user + session + org +
 * provider, 10-minute expiry, internal return path; callback → atomic claim,
 * same session/user, current membership + permission, server-side code
 * exchange, sealed tokens, a real read of granted scopes/assets, and a
 * generation compare-and-swap so a disconnect during the exchange wins.
 */

export const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000;

/** Query parameter values the integrations page understands after a redirect back. */
export type OAuthResult =
  | "connected"
  | "limited"
  | "cancelled"
  | "failed"
  | "expired"
  | "forbidden"
  | "not_configured"
  | "requires_recent_auth"
  | "requires_verified_email";

export function oauthRedirectUri(provider: OAuthProvider): string {
  return `${site.appUrl}/api/integrations/${provider}/callback`;
}

export function integrationsPath(slug: string): string {
  return `/home/${slug}/integrations`;
}

/** Return paths are only ever an org's integrations page. */
function isAllowedReturnPath(path: string): boolean {
  return isSafeReturnPath(path) && /^\/home\/[a-z0-9-]+\/integrations$/.test(path);
}

export function resultPath(returnPath: string, provider: OAuthProvider, result: OAuthResult, reason?: IntegrationErrorCategory): string {
  const base = isAllowedReturnPath(returnPath) ? returnPath : "/home";
  const params = new URLSearchParams({ integration: provider, result });
  if (reason) params.set("reason", reason);
  return `${base}?${params.toString()}#${provider}`;
}

export function requestedScopes(provider: OAuthProvider, metaCapability: MetaCapability): string[] {
  return provider === "meta_ads" ? [...metaCapabilityScopes[metaCapability]] : [];
}

export type StartOutcome = { ok: true; redirectTo: string } | { ok: false; redirectTo: string; result: OAuthResult };

/**
 * Starts authorization. Throws NotFoundError for non-members (caller turns it
 * into a 404); every other refusal returns to the card with a result code.
 */
export async function startOAuth(slug: string, provider: OAuthProvider, metaCapability: MetaCapability = "reporting"): Promise<StartOutcome> {
  const ctx = await requireOrgAction(slug, "workspace:read");
  const returnPath = integrationsPath(ctx.org.slug);
  const refuse = (result: OAuthResult): StartOutcome => ({ ok: false, result, redirectTo: resultPath(returnPath, provider, result) });

  if (!can(ctx.actor, "integrations:manage")) return refuse("forbidden");
  const blocker = sensitiveBlocker(ctx);
  if (blocker) return refuse(blocker.ok ? "failed" : blocker.code === "requires_verified_email" ? "requires_verified_email" : "requires_recent_auth");
  const adapter = oauthAdapter(provider);
  if (!adapter || !adapter.configured() || !capability(provider).configured) return refuse("not_configured");

  const state = generateToken(32);
  const scopes = requestedScopes(provider, metaCapability);
  const now = new Date();
  const db = await getDb();
  await db.insert(oauthAttempts).values({
    id: newId("oau"),
    stateDigest: tokenDigest(state, "oauth_state"),
    userId: ctx.user.id,
    sessionId: ctx.session.id,
    orgId: ctx.org.id,
    provider,
    pkceVerifierSealed: null,
    returnPath,
    requestedScopes: scopes,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS),
  });
  await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "integration.oauth_start", targetType: "integration", data: { provider, scopes } });
  return { ok: true, redirectTo: adapter.authorizeUrl({ state, redirectUri: oauthRedirectUri(provider), scopes }) };
}

/** Whether `userId` currently holds integrations:manage in `orgId`. */
async function canManageIntegrations(orgId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ role: memberships.role, primaryOwnerUserId: organizations.primaryOwnerUserId })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  if (!row) return false;
  const actor: Actor = { role: row.role, isPrimaryOwner: row.primaryOwnerUserId === userId };
  return can(actor, "integrations:manage");
}

function assessGrant(grant: OAuthGrant, requested: string[]): { status: "connected" | "limited_permissions"; category: IntegrationErrorCategory | null } {
  if (grant.assets.length === 0) return { status: "limited_permissions", category: "no_eligible_assets" };
  if (requested.some((scope) => !grant.grantedScopes.includes(scope))) return { status: "limited_permissions", category: "scopes_declined" };
  return { status: "connected", category: null };
}

/**
 * Handles the provider redirect. Returns the internal path to send the
 * browser to. Nothing is stored unless every check passes and the new token
 * completes a real read.
 */
export async function completeOAuth(provider: OAuthProvider, params: URLSearchParams, now: Date = new Date()): Promise<string> {
  const state = params.get("state");
  if (!state || state.length > 200) return "/home";
  const digest = tokenDigest(state, "oauth_state");
  const db = await getDb();

  // Atomic one-time claim: concurrent or replayed callbacks cannot both pass.
  const [attempt] = await db
    .update(oauthAttempts)
    .set({ consumedAt: now })
    .where(and(eq(oauthAttempts.stateDigest, digest), isNull(oauthAttempts.consumedAt), gt(oauthAttempts.expiresAt, now)))
    .returning();
  if (!attempt) {
    const [known] = await db.select({ returnPath: oauthAttempts.returnPath, provider: oauthAttempts.provider }).from(oauthAttempts).where(eq(oauthAttempts.stateDigest, digest)).limit(1);
    return known ? resultPath(known.returnPath, provider, "expired") : "/home";
  }
  const back = (result: OAuthResult, reason?: IntegrationErrorCategory) => resultPath(attempt.returnPath, provider, result, reason);

  if (attempt.provider !== provider) return back("failed");
  const current = await getCurrentSession();
  if (!current || current.session.id !== attempt.sessionId || current.user.id !== attempt.userId) return back("forbidden");
  if (!(await canManageIntegrations(attempt.orgId, attempt.userId))) return back("forbidden");

  const adapter = oauthAdapter(provider) as OAuthAdapter;
  if (!adapter.configured()) return back("not_configured");
  const callback = adapter.readCallback(params);
  if (callback.kind === "cancelled") return back("cancelled");

  const before = await findInstallation(db, attempt.orgId, provider);
  let tokens: OAuthTokenSet;
  let grant: OAuthGrant;
  try {
    tokens = await adapter.exchangeCode({ code: callback.code, redirectUri: oauthRedirectUri(provider) });
  } catch (error) {
    return back("failed", error instanceof ProviderError ? error.category : "token_exchange_failed");
  }
  try {
    grant = await adapter.readGrant(tokens);
  } catch (error) {
    await revokeQuietly(adapter, tokens);
    return back("failed", error instanceof ProviderError ? error.category : "provider_error");
  }

  // Membership may have changed during the exchange: fail closed and discard the new token.
  if (!(await canManageIntegrations(attempt.orgId, attempt.userId))) {
    await revokeQuietly(adapter, tokens);
    return back("forbidden");
  }

  const assessment = assessGrant(grant, attempt.requestedScopes);
  const stored = await db.transaction(async (tx) => {
    let ref: { id: string; generation: number } | null = null;
    const values = {
      status: assessment.status,
      connectedByUserId: attempt.userId,
      grantedScopes: grant.grantedScopes,
      selectedAssets: grant.assets,
      publicConfig: { requestedScopes: attempt.requestedScopes.join(",") },
      connectedAt: now,
      verifiedAt: now,
      lastErrorCategory: assessment.category,
      lastErrorAt: assessment.category ? now : null,
      revokedAt: null,
      updatedAt: now,
    };
    if (!before) {
      const inserted = await tx
        .insert(integrationInstallations)
        .values({ id: newId("int"), orgId: attempt.orgId, provider, generation: 1, ...values })
        .onConflictDoNothing()
        .returning({ id: integrationInstallations.id, generation: integrationInstallations.generation });
      ref = inserted[0] ?? null;
    } else {
      // Compare-and-swap on the generation read before the exchange.
      const updated = await tx
        .update(integrationInstallations)
        .set({ ...values, generation: before.generation + 1 })
        .where(
          and(
            eq(integrationInstallations.id, before.id),
            eq(integrationInstallations.orgId, attempt.orgId),
            eq(integrationInstallations.generation, before.generation),
          ),
        )
        .returning({ id: integrationInstallations.id, generation: integrationInstallations.generation });
      ref = updated[0] ?? null;
    }
    if (!ref) return null;
    await storeCredential(tx, { orgId: attempt.orgId, installationId: ref.id, provider, generation: ref.generation }, { ...tokens }, tokens.expiresAt);
    await recordAudit(
      {
        orgId: attempt.orgId,
        actorUserId: attempt.userId,
        action: "integration.connect",
        targetType: "integration",
        targetId: ref.id,
        data: { provider, status: assessment.status, assets: grant.assets.length, scopes: grant.grantedScopes },
      },
      tx,
    );
    return ref;
  });
  if (!stored) {
    await revokeQuietly(adapter, tokens);
    return back("failed");
  }
  return back(assessment.status === "connected" ? "connected" : "limited", assessment.category ?? undefined);
}

async function revokeQuietly(adapter: OAuthAdapter, tokens: OAuthTokenSet): Promise<void> {
  try {
    await adapter.revoke(tokens);
  } catch {
    // Best effort: the token was never stored, so nothing in this product can use it.
  }
}
