import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { fail, ok, runAction, type ActionResult } from "../action-result";
import { recordAudit } from "../audit";
import { NotFoundError } from "../authz";
import { getDb, type DbLike } from "../db/client";
import { integrationInstallations, integrationProviders, users, type IntegrationProvider, type IntegrationStatus } from "../db/schema";
import { capability, type CapabilityKey } from "../readiness";
import { destroyCredentials, loadCurrentCredential } from "./credentials";
import { requireSensitiveAction } from "./guards";
import type { IntegrationErrorCategory } from "./provider-error";
import { oauthAdapter } from "./providers";
import type { IntegrationAsset, OAuthTokenSet } from "./providers/types";

export type Installation = typeof integrationInstallations.$inferSelect;

/**
 * What the card shows. `not_configured` = this deployment lacks the product
 * credential/identity; `not_connected` = no live installation for this org.
 * Everything else is the stored installation status.
 */
export type DisplayStatus = "not_configured" | "not_connected" | Exclude<IntegrationStatus, "not_configured" | "disconnected">;

/** Sanitized installation for rendering — never includes credential material. */
export interface InstallationView {
  status: IntegrationStatus;
  connectedBy: string | null;
  connectedAt: string | null;
  verifiedAt: string | null;
  lastSyncAt: string | null;
  lastErrorCategory: IntegrationErrorCategory | null;
  lastErrorAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
  grantedScopes: string[];
  selectedAssets: IntegrationAsset[];
  publicConfig: Record<string, string>;
}

export interface IntegrationOverview {
  provider: IntegrationProvider;
  configured: boolean;
  configurationDetail: string;
  displayStatus: DisplayStatus;
  installation: InstallationView | null;
}

const capabilityFor: Record<IntegrationProvider, CapabilityKey> = {
  app_store_connect: "app_store_connect",
  google_play: "google_play",
  meta_ads: "meta_ads",
  tiktok_ads: "tiktok_ads",
};

export function displayStatusFor(configured: boolean, installation: Pick<Installation, "status"> | null): DisplayStatus {
  if (installation && installation.status !== "disconnected" && installation.status !== "not_configured") return installation.status;
  return configured ? "not_connected" : "not_configured";
}

/** Per-provider state for the org. `orgId` must come from an authorized context. */
export async function loadIntegrationsOverview(orgId: string): Promise<IntegrationOverview[]> {
  const db = await getDb();
  const rows = await db
    .select({
      installation: integrationInstallations,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(integrationInstallations)
    .leftJoin(users, eq(users.id, integrationInstallations.connectedByUserId))
    .where(eq(integrationInstallations.orgId, orgId));
  const byProvider = new Map(rows.map((r) => [r.installation.provider, r]));

  return integrationProviders.map((provider) => {
    const cap = capability(capabilityFor[provider]);
    const row = byProvider.get(provider);
    const i = row?.installation ?? null;
    const name = row ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email : null;
    return {
      provider,
      configured: cap.configured,
      configurationDetail: cap.detail,
      displayStatus: displayStatusFor(cap.configured, i),
      installation: i
        ? {
            status: i.status,
            connectedBy: name ?? null,
            connectedAt: i.connectedAt?.toISOString() ?? null,
            verifiedAt: i.verifiedAt?.toISOString() ?? null,
            lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
            lastErrorCategory: (i.lastErrorCategory as IntegrationErrorCategory | null) ?? null,
            lastErrorAt: i.lastErrorAt?.toISOString() ?? null,
            revokedAt: i.revokedAt?.toISOString() ?? null,
            updatedAt: i.updatedAt.toISOString(),
            grantedScopes: i.grantedScopes,
            selectedAssets: i.selectedAssets,
            publicConfig: i.publicConfig,
          }
        : null,
    };
  });
}

export async function findInstallation(db: DbLike, orgId: string, provider: IntegrationProvider): Promise<Installation | null> {
  const [row] = await db
    .select()
    .from(integrationInstallations)
    .where(and(eq(integrationInstallations.orgId, orgId), eq(integrationInstallations.provider, provider)))
    .limit(1);
  return row ?? null;
}

/**
 * Starts a new credential generation for (org, provider): inserts the
 * installation or bumps its generation. Older generations can no longer be
 * opened (their associated data no longer matches) or overwrite this one.
 */
export async function beginGeneration(
  tx: DbLike,
  orgId: string,
  provider: IntegrationProvider,
  values: Partial<Pick<Installation, "status" | "connectedByUserId" | "publicConfig" | "grantedScopes" | "selectedAssets">>,
): Promise<{ id: string; generation: number }> {
  const now = new Date();
  const [row] = await tx
    .insert(integrationInstallations)
    .values({
      id: newId("int"),
      orgId,
      provider,
      status: values.status ?? "verifying",
      connectedByUserId: values.connectedByUserId ?? null,
      publicConfig: values.publicConfig ?? {},
      grantedScopes: values.grantedScopes ?? [],
      selectedAssets: values.selectedAssets ?? [],
      generation: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [integrationInstallations.orgId, integrationInstallations.provider],
      set: {
        status: values.status ?? "verifying",
        connectedByUserId: values.connectedByUserId ?? null,
        publicConfig: values.publicConfig ?? {},
        grantedScopes: values.grantedScopes ?? [],
        selectedAssets: values.selectedAssets ?? [],
        generation: sql`${integrationInstallations.generation} + 1`,
        connectedAt: null,
        verifiedAt: null,
        lastErrorCategory: null,
        lastErrorAt: null,
        revokedAt: null,
        updatedAt: now,
      },
    })
    .returning({ id: integrationInstallations.id, generation: integrationInstallations.generation });
  return row;
}

/** Updates an installation only while it is still at `generation` (compare-and-swap). Returns whether it applied. */
export async function updateGeneration(
  tx: DbLike,
  ref: { id: string; orgId: string; generation: number },
  set: Partial<typeof integrationInstallations.$inferInsert>,
): Promise<boolean> {
  const rows = await tx
    .update(integrationInstallations)
    .set({ ...set, updatedAt: new Date() })
    .where(
      and(
        eq(integrationInstallations.id, ref.id),
        eq(integrationInstallations.orgId, ref.orgId),
        eq(integrationInstallations.generation, ref.generation),
      ),
    )
    .returning({ id: integrationInstallations.id });
  return rows.length > 0;
}

export type DisconnectOutcome = "disconnected" | "revocation_pending";

/**
 * Disconnect: (1) disable locally first — status `disconnected`, generation
 * bumped (so an in-flight connection cannot complete), credentials destroyed;
 * (2) then ask the provider to revoke the token where it supports it. A remote
 * failure leaves `revocation_pending`; local disconnection still blocks work.
 */
export async function disconnectIntegration(slug: string, provider: IntegrationProvider): Promise<ActionResult<{ outcome: DisconnectOutcome }>> {
  return runAction(async () => {
    const gate = await requireSensitiveAction(slug, "integrations:manage");
    if (!gate.ok) return gate.result;
    const { ctx } = gate;
    const db = await getDb();
    const installation = await findInstallation(db, ctx.org.id, provider);
    if (!installation || installation.status === "disconnected") throw new NotFoundError("This integration is not connected.");

    const owner = { orgId: ctx.org.id, installationId: installation.id, provider, generation: installation.generation };
    let tokens: OAuthTokenSet | null = null;
    const adapter = oauthAdapter(provider);
    if (adapter) {
      try {
        tokens = await loadCurrentCredential<OAuthTokenSet>(owner);
      } catch {
        tokens = null; // Key unavailable or credential unreadable: still disconnect locally.
      }
    }

    const disabled = await db.transaction(async (tx) => {
      const applied = await updateGeneration(tx, owner, {
        status: "disconnected",
        generation: installation.generation + 1,
        revokedAt: new Date(),
        lastErrorCategory: null,
        lastErrorAt: null,
      });
      if (!applied) return false;
      await destroyCredentials(tx, ctx.org.id, installation.id);
      await recordAudit(
        { orgId: ctx.org.id, actorUserId: ctx.user.id, action: "integration.disconnect", targetType: "integration", targetId: installation.id, data: { provider } },
        tx,
      );
      return true;
    });
    if (!disabled) return fail("This integration changed while you were disconnecting it. Reload and try again.", "conflict");

    if (adapter && tokens) {
      try {
        await adapter.revoke(tokens);
        await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "integration.revoked", targetType: "integration", targetId: installation.id, data: { provider } });
      } catch {
        const category: IntegrationErrorCategory = "revocation_failed";
        await updateGeneration(db, { ...owner, generation: installation.generation + 1 }, { status: "revocation_pending", lastErrorCategory: category, lastErrorAt: new Date() });
        await recordAudit({
          orgId: ctx.org.id,
          actorUserId: ctx.user.id,
          action: "integration.revocation_failed",
          targetType: "integration",
          targetId: installation.id,
          data: { provider },
        });
        return ok({ outcome: "revocation_pending" as const }, "Disconnected here, but the provider didn't confirm removing access.");
      }
    }
    return ok({ outcome: "disconnected" as const }, "Disconnected.");
  });
}
