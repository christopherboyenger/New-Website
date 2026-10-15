import "server-only";
import { and, count, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { can, type Actor } from "@/domain/permissions";
import { newId } from "@/lib/ids";
import { fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { NotFoundError } from "./authz";
import { constantTimeEqual, generateToken, tokenDigest } from "./crypto";
import { getDb } from "./db/client";
import { apiGrants, memberships, organizations, users, type ApiGrantScope } from "./db/schema";
import { requireSensitiveAction } from "./integrations/guards";

/**
 * Reporting API grants (production-integration-contracts.md §7). An Owner
 * creates a labelled, scoped, optionally expiring token for one organization.
 * The plaintext is returned exactly once; only a keyed digest and a public
 * lookup prefix are stored. A grant is delegated by its creator: it stops
 * working as soon as that person no longer manages API tokens in the org.
 */

/** Scopes that have endpoints today (creators:read is reserved until a creators endpoint ships). */
export const issuableApiScopes = ["reports:read", "campaigns:read", "playbooks:read"] as const satisfies readonly ApiGrantScope[];
export type IssuableApiScope = (typeof issuableApiScopes)[number];

export const apiScopeDescriptions: Record<IssuableApiScope, string> = {
  "reports:read": "Daily reports and post drilldown",
  "campaigns:read": "Campaign list (IDs, names, active)",
  "playbooks:read": "Playbook list (IDs, names, active)",
};

export const tokenExpiryChoices = ["30", "90", "365", "never"] as const;
export type TokenExpiryChoice = (typeof tokenExpiryChoices)[number];

export const MAX_ACTIVE_GRANTS_PER_ORG = 20;
const TOKEN_PREFIX = "rk_";
/** lastUsedAt is written at most once per this interval per grant. */
export const LAST_USED_THROTTLE_MS = 60_000;

export const createGrantSchema = z.object({
  label: z.string().trim().min(1, "Give the token a name so you can recognise it later.").max(60, "Keep the name under 60 characters."),
  scopes: z
    .array(z.enum(issuableApiScopes))
    .min(1, "Choose at least one scope.")
    .transform((s) => [...new Set(s)]),
  expiry: z.enum(tokenExpiryChoices, { message: "Choose when the token expires." }),
});

export interface ApiGrantView {
  id: string;
  label: string;
  tokenPrefix: string;
  scopes: ApiGrantScope[];
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
}

export interface AuthenticatedGrant {
  grant: { id: string; scopes: ApiGrantScope[]; label: string };
  org: { id: string; slug: string };
}

/** `rk_<8 public chars>_<43 secret chars>`; the first two parts are the display/lookup prefix. */
export function mintToken(): { token: string; prefix: string } {
  const prefix = `${TOKEN_PREFIX}${generateToken(6).replace(/[-_]/g, "x").slice(0, 8)}`;
  return { token: `${prefix}_${generateToken(32)}`, prefix };
}

export function grantStatus(row: { revokedAt: Date | null; expiresAt: Date | null }, now: Date = new Date()): ApiGrantView["status"] {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

function expiryDate(choice: TokenExpiryChoice, now: Date): Date | null {
  return choice === "never" ? null : new Date(now.getTime() + Number(choice) * 86_400_000);
}

/** Token metadata for the org (never the token or its digest). `orgId` must come from an authorized context. */
export async function listApiGrants(orgId: string, now: Date = new Date()): Promise<ApiGrantView[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: apiGrants.id,
      label: apiGrants.label,
      tokenPrefix: apiGrants.tokenPrefix,
      scopes: apiGrants.scopes,
      createdAt: apiGrants.createdAt,
      lastUsedAt: apiGrants.lastUsedAt,
      expiresAt: apiGrants.expiresAt,
      revokedAt: apiGrants.revokedAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(apiGrants)
    .innerJoin(users, eq(users.id, apiGrants.createdByUserId))
    .where(eq(apiGrants.orgId, orgId))
    .orderBy(desc(apiGrants.createdAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    tokenPrefix: r.tokenPrefix,
    scopes: r.scopes,
    createdBy: `${r.firstName} ${r.lastName}`.trim() || r.email,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    status: grantStatus(r, now),
  }));
}

export interface CreatedGrant {
  /** Shown once; never stored or retrievable again. */
  token: string;
  grant: ApiGrantView;
}

export async function createApiGrant(slug: string, input: unknown): Promise<ActionResult<CreatedGrant>> {
  return runAction<CreatedGrant>(async () => {
    const gate = await requireSensitiveAction(slug, "api_tokens:manage");
    if (!gate.ok) return gate.result;
    const { ctx } = gate;
    const parsed = createGrantSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { label, scopes, expiry } = parsed.data;

    const db = await getDb();
    const now = new Date();
    const [{ active }] = await db
      .select({ active: count() })
      .from(apiGrants)
      .where(and(eq(apiGrants.orgId, ctx.org.id), isNull(apiGrants.revokedAt), or(isNull(apiGrants.expiresAt), gt(apiGrants.expiresAt, now))));
    if (active >= MAX_ACTIVE_GRANTS_PER_ORG) {
      return fail(`This workspace already has ${MAX_ACTIVE_GRANTS_PER_ORG} active tokens. Revoke one you no longer use first.`, "conflict");
    }

    const { token, prefix } = mintToken();
    const id = newId("api");
    const expiresAt = expiryDate(expiry, now);
    await db.transaction(async (tx) => {
      await tx.insert(apiGrants).values({
        id,
        orgId: ctx.org.id,
        label,
        tokenPrefix: prefix,
        tokenDigest: tokenDigest(token, "api_grant"),
        scopes,
        createdByUserId: ctx.user.id,
        createdAt: now,
        expiresAt,
      });
      await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "api_grant.create", targetType: "api_grant", targetId: id, data: { label, scopes, prefix, expiresAt: expiresAt?.toISOString() ?? null } }, tx);
    });
    const name = `${ctx.user.firstName} ${ctx.user.lastName}`.trim() || ctx.user.email;
    return ok(
      {
        token,
        grant: {
          id,
          label,
          tokenPrefix: prefix,
          scopes,
          createdBy: name,
          createdAt: now.toISOString(),
          lastUsedAt: null,
          expiresAt: expiresAt?.toISOString() ?? null,
          revokedAt: null,
          status: "active",
        },
      },
      "Token created. Copy it now — it won't be shown again.",
    );
  });
}

export async function revokeApiGrant(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const gate = await requireSensitiveAction(slug, "api_tokens:manage");
    if (!gate.ok) return gate.result;
    const { ctx } = gate;
    const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(input);
    if (!parsed.success) throw new NotFoundError("Token not found.");
    const db = await getDb();
    const [row] = await db
      .update(apiGrants)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiGrants.id, parsed.data.id), eq(apiGrants.orgId, ctx.org.id), isNull(apiGrants.revokedAt)))
      .returning({ id: apiGrants.id, prefix: apiGrants.tokenPrefix });
    if (!row) throw new NotFoundError("Token not found.");
    await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "api_grant.revoke", targetType: "api_grant", targetId: row.id, data: { prefix: row.prefix } });
    return ok({ id: row.id }, "Token revoked. Requests using it now fail.");
  });
}

/** Extracts a bearer token from an Authorization header value (bounded length, single token). */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer[ ]+([A-Za-z0-9_-]{10,200})$/.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Resolves `Authorization: Bearer <token>` to its grant and organization, or
 * null when the token is missing, unknown, revoked, expired, or its creator no
 * longer manages API tokens in that organization. The organization always
 * comes from the grant, never from the request.
 */
export async function authenticateApiToken(authorization: string | null, now: Date = new Date()): Promise<AuthenticatedGrant | null> {
  const token = parseBearer(authorization);
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const digest = tokenDigest(token, "api_grant");
  const db = await getDb();
  const [row] = await db
    .select({
      id: apiGrants.id,
      digest: apiGrants.tokenDigest,
      label: apiGrants.label,
      scopes: apiGrants.scopes,
      revokedAt: apiGrants.revokedAt,
      expiresAt: apiGrants.expiresAt,
      lastUsedAt: apiGrants.lastUsedAt,
      orgId: organizations.id,
      orgSlug: organizations.slug,
      primaryOwnerUserId: organizations.primaryOwnerUserId,
      creatorId: apiGrants.createdByUserId,
      creatorRole: memberships.role,
      creatorDisabledAt: users.disabledAt,
    })
    .from(apiGrants)
    .innerJoin(organizations, eq(organizations.id, apiGrants.orgId))
    .innerJoin(users, eq(users.id, apiGrants.createdByUserId))
    .leftJoin(memberships, and(eq(memberships.orgId, apiGrants.orgId), eq(memberships.userId, apiGrants.createdByUserId)))
    .where(eq(apiGrants.tokenDigest, digest))
    .limit(1);
  if (!row || !constantTimeEqual(row.digest, digest)) return null;
  if (grantStatus(row, now) !== "active") return null;
  if (!row.creatorRole || row.creatorDisabledAt) return null;
  const actor: Actor = { role: row.creatorRole, isPrimaryOwner: row.primaryOwnerUserId === row.creatorId };
  if (!can(actor, "api_tokens:manage")) return null;

  await touchLastUsed(row.id, row.lastUsedAt, now);
  return { grant: { id: row.id, scopes: row.scopes, label: row.label }, org: { id: row.orgId, slug: row.orgSlug } };
}

export function grantHasScope(grant: { scopes: readonly string[] }, scope: ApiGrantScope): boolean {
  return grant.scopes.includes(scope);
}

/** Records use at most once per LAST_USED_THROTTLE_MS so busy integrations don't write on every request. */
async function touchLastUsed(id: string, lastUsedAt: Date | null, now: Date): Promise<void> {
  if (lastUsedAt && now.getTime() - lastUsedAt.getTime() < LAST_USED_THROTTLE_MS) return;
  const db = await getDb();
  const threshold = new Date(now.getTime() - LAST_USED_THROTTLE_MS);
  await db
    .update(apiGrants)
    .set({ lastUsedAt: now })
    .where(and(eq(apiGrants.id, id), or(isNull(apiGrants.lastUsedAt), lt(apiGrants.lastUsedAt, threshold))));
}
