import "server-only";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { z } from "zod";
import { fail, fromZodError, ok, runAction, type ActionResult } from "../action-result";
import { recordAudit } from "../audit";
import { getDb } from "../db/client";
import { consumeRateLimit } from "../rate-limit";
import { capability } from "../readiness";
import { destroyCredentials, storeCredential } from "./credentials";
import { requireSensitiveAction } from "./guards";
import { beginGeneration, updateGeneration } from "./installations";
import { categoryForStatus, ProviderError, providerFetch, readJson, type IntegrationErrorCategory } from "./provider-error";
import type { IntegrationAsset } from "./providers/types";

/**
 * App Store Connect: the customer creates an API key (Sales and Reports,
 * read-only) and pastes Issuer ID, Key ID and the .p8 contents. The key is
 * sealed into credential custody, then verified with a real API read. The
 * installation is `connected` only when that read succeeds.
 */

const ASC_API = "https://api.appstoreconnect.apple.com/v1";
/** Apple rejects tokens with a lifetime above 20 minutes. */
const TOKEN_LIFETIME_SECONDS = 15 * 60;

export const appStoreConnectSchema = z.object({
  issuerId: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Enter the Issuer ID shown above your keys (a UUID like 69a6de70-…)."),
  keyId: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{10}$/, "Enter the 10-character Key ID (letters and numbers)."),
  privateKey: z
    .string()
    .trim()
    .min(1, "Paste the contents of the .p8 file.")
    .max(4000, "That doesn't look like a .p8 key.")
    .refine((v) => /-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(v), "Paste the whole .p8 file, including the BEGIN and END lines."),
});

export type AppStoreConnectInput = z.input<typeof appStoreConnectSchema>;

/** Parses the .p8 contents; App Store Connect keys are EC P-256. */
export function parseP8(pem: string): KeyObject | null {
  try {
    const key = createPrivateKey({ key: pem, format: "pem" });
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return null;
    return key;
  } catch {
    return null;
  }
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

/** ES256 JWT for the App Store Connect API (signature in JOSE r||s form). */
export function signAppStoreConnectToken(input: { issuerId: string; keyId: string; key: KeyObject; now?: Date }): string {
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: input.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: input.issuerId, iat, exp: iat + TOKEN_LIFETIME_SECONDS, aud: "appstoreconnect-v1" }));
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), { key: input.key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Real verification read: lists the apps this key can see. Signing a JWT alone proves nothing. */
export async function verifyAppStoreConnectKey(token: string): Promise<IntegrationAsset[]> {
  const url = `${ASC_API}/apps?limit=50&fields[apps]=name,bundleId`;
  const response = await providerFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new ProviderError(categoryForStatus(response.status));
  const body = (await readJson(response)) as { data?: Array<{ id?: unknown; attributes?: { name?: unknown; bundleId?: unknown } }> };
  return (body.data ?? [])
    .filter((app) => typeof app.id === "string")
    .map((app) => ({
      id: app.id as string,
      name: typeof app.attributes?.name === "string" ? app.attributes.name : (app.id as string),
      kind: typeof app.attributes?.bundleId === "string" ? `app:${app.attributes.bundleId}` : "app",
    }));
}

export interface AppStoreConnectResult {
  status: "connected" | "error";
  errorCategory: IntegrationErrorCategory | null;
  apps: number;
}

export async function connectAppStoreConnect(slug: string, input: unknown): Promise<ActionResult<AppStoreConnectResult>> {
  return runAction<AppStoreConnectResult>(async () => {
    const gate = await requireSensitiveAction(slug, "integrations:manage");
    if (!gate.ok) return gate.result;
    const { ctx } = gate;
    if (!capability("credential_custody").configured) {
      return fail("This deployment can't accept private keys yet: secure credential storage isn't configured.", "not_configured");
    }
    const parsed = appStoreConnectSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { issuerId, keyId, privateKey } = parsed.data;
    const key = parseP8(privateKey);
    if (!key) return fail("Check the highlighted fields.", "validation", { privateKey: "This isn't a valid App Store Connect .p8 private key." });

    const limit = await consumeRateLimit(`integrations:asc:${ctx.org.id}`, 10, 60 * 60);
    if (!limit.allowed) return fail("Too many validation attempts. Try again in an hour.", "rate_limited");

    const db = await getDb();
    const installation = await db.transaction(async (tx) => {
      const ref = await beginGeneration(tx, ctx.org.id, "app_store_connect", {
        status: "verifying",
        connectedByUserId: ctx.user.id,
        publicConfig: { issuerId, keyId },
      });
      await storeCredential(tx, { orgId: ctx.org.id, installationId: ref.id, provider: "app_store_connect", generation: ref.generation }, { issuerId, keyId, privateKey });
      return ref;
    });
    const ref = { id: installation.id, orgId: ctx.org.id, generation: installation.generation };

    let apps: IntegrationAsset[];
    try {
      apps = await verifyAppStoreConnectKey(signAppStoreConnectToken({ issuerId, keyId, key }));
    } catch (error) {
      const category: IntegrationErrorCategory = error instanceof ProviderError ? error.category : "provider_error";
      // An unverified key is not kept: the customer re-enters it to retry.
      await db.transaction(async (tx) => {
        await updateGeneration(tx, ref, { status: "error", lastErrorCategory: category, lastErrorAt: new Date() });
        await destroyCredentials(tx, ctx.org.id, ref.id);
      });
      await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "integration.verify_failed", targetType: "integration", targetId: ref.id, data: { provider: "app_store_connect", category } });
      return ok({ status: "error" as const, errorCategory: category, apps: 0 });
    }

    const now = new Date();
    const applied = await updateGeneration(db, ref, {
      status: "connected",
      selectedAssets: apps,
      grantedScopes: ["apps:read"],
      connectedAt: now,
      verifiedAt: now,
      lastErrorCategory: null,
      lastErrorAt: null,
    });
    if (!applied) return fail("This integration changed while the key was being verified. Reload and try again.", "conflict");
    await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "integration.connect", targetType: "integration", targetId: ref.id, data: { provider: "app_store_connect", apps: apps.length } });
    return ok({ status: "connected" as const, errorCategory: null, apps: apps.length }, "App Store Connect key verified.");
  });
}
