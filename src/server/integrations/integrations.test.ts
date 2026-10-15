import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/support/db";
import { addMember, makeOrg, makeUser } from "../../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../../tests/support/request-context";
import { hashPassword } from "../auth/password";
import { requireOrgAction } from "../authz";
import { CredentialEncryptionUnavailableError } from "../crypto";
import { getDb } from "../db/client";
import { auditLog, credentialVersions, integrationInstallations, sessions } from "../db/schema";
import { resetEnvForTesting } from "../env";
import { connectAppStoreConnect, signAppStoreConnectToken, parseP8 } from "./app-store-connect";
import { credentialAssociatedData, loadCurrentCredential, openCredential, sealCredential, storeCredential } from "./credentials";
import { connectGooglePlay } from "./google-play";
import { confirmRecentAuth } from "./guards";
import { beginGeneration, disconnectIntegration, displayStatusFor, loadIntegrationsOverview } from "./installations";
import { loadIntegrationsPageData } from "./page-data";

const ENV_KEYS = ["CREDENTIALS_ENCRYPTION_KEY", "GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL", "META_APP_ID", "META_APP_SECRET"] as const;
const saved: Partial<Record<string, string | undefined>> = {};
const encryptionKey = randomBytes(32).toString("base64");

function configure(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  resetEnvForTesting();
}

const p8 = () =>
  generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const ascInput = (privateKey = p8()) => ({ issuerId: "69a6de70-0000-4000-8000-000000000001", keyId: "A1B2C3D4E5", privateKey });

function stubFetch(handler: (url: URL, init?: RequestInit) => Response) {
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function staleRecentAuth(userId: string) {
  const db = await getDb();
  await db.update(sessions).set({ recentAuthAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(sessions.userId, userId));
}

describe("integrations", () => {
  beforeEach(async () => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    configure({ CREDENTIALS_ENCRYPTION_KEY: encryptionKey, GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: "reports@product-project.iam.gserviceaccount.com", META_APP_ID: "1", META_APP_SECRET: "s" });
    await createTestDb();
    resetRequestContext();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetEnvForTesting();
  });

  describe("credential sealing", () => {
    const owner = { orgId: "org_a", installationId: "int_a", provider: "meta_ads" as const, generation: 2 };

    it("opens only with the exact org/installation/provider/generation binding", () => {
      const sealed = sealCredential(owner, { accessToken: "secret-token" });
      expect(JSON.stringify(sealed)).not.toContain("secret-token");
      expect(credentialAssociatedData(owner)).toBe("org_a:int_a:meta_ads:2");
      expect(openCredential<{ accessToken: string }>(owner, sealed).accessToken).toBe("secret-token");
      for (const changed of [{ orgId: "org_b" }, { installationId: "int_b" }, { provider: "tiktok_ads" as const }, { generation: 3 }]) {
        expect(() => openCredential({ ...owner, ...changed }, sealed)).toThrow();
      }
      expect(() => openCredential(owner, { ...sealed, ct: Buffer.from("tampered").toString("base64") })).toThrow();
    });

    it("refuses to seal without an encryption key", async () => {
      configure({});
      expect(() => sealCredential(owner, { accessToken: "x" })).toThrow(CredentialEncryptionUnavailableError);
      const { org, owner: user } = await makeOrg();
      await signInAs(user.id);
      expect(await connectAppStoreConnect(org.slug, ascInput())).toMatchObject({ ok: false, code: "not_configured" });
      const db = await getDb();
      expect(await db.select().from(integrationInstallations)).toHaveLength(0);
    });
  });

  describe("App Store Connect", () => {
    it("signs an ES256 token and connects only after a successful API read, never echoing the key", async () => {
      const { org, owner } = await makeOrg();
      await signInAs(owner.id);
      const input = ascInput();
      let authorization = "";
      stubFetch((url, init) => {
        expect(url.origin).toBe("https://api.appstoreconnect.apple.com");
        expect(url.pathname).toBe("/v1/apps");
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return json({ data: [{ id: "123", attributes: { name: "My App", bundleId: "com.example.app" } }] });
      });

      const result = await connectAppStoreConnect(org.slug, input);
      expect(result).toMatchObject({ ok: true, data: { status: "connected", apps: 1 } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE KEY");

      // The bearer is a valid ES256 JWT for this key.
      const [header, payload, signature] = authorization.replace("Bearer ", "").split(".");
      expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: input.keyId, typ: "JWT" });
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      expect(claims).toMatchObject({ iss: input.issuerId, aud: "appstoreconnect-v1" });
      expect(claims.exp - claims.iat).toBeLessThanOrEqual(20 * 60);
      const publicKey = createPublicKey(parseP8(input.privateKey)!);
      expect(verify("sha256", Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);

      const overview = (await loadIntegrationsOverview(org.id)).find((o) => o.provider === "app_store_connect")!;
      expect(overview.displayStatus).toBe("connected");
      expect(overview.installation?.publicConfig).toEqual({ issuerId: input.issuerId, keyId: input.keyId });
      expect(overview.installation?.selectedAssets).toEqual([{ id: "123", name: "My App", kind: "app:com.example.app" }]);
      const page = await loadIntegrationsPageData(await requireOrgAction(org.slug));
      expect(JSON.stringify(page)).not.toContain("PRIVATE KEY");

      const db = await getDb();
      const [installation] = await db.select().from(integrationInstallations);
      const creds = await db.select().from(credentialVersions);
      expect(creds).toHaveLength(1);
      expect(JSON.stringify(creds)).not.toContain("PRIVATE KEY");
      const opened = await loadCurrentCredential<{ privateKey: string }>({ orgId: org.id, installationId: installation.id, provider: "app_store_connect", generation: installation.generation });
      expect(opened?.privateKey).toBe(input.privateKey.trim());
      expect(JSON.stringify(await db.select().from(auditLog))).not.toContain("PRIVATE KEY");
    });

    it("records a sanitized error and discards the key when Apple rejects it", async () => {
      const { org, owner } = await makeOrg();
      await signInAs(owner.id);
      stubFetch(() => json({ errors: [{ detail: "token was rejected, contains secret-ish detail" }] }, 401));
      expect(await connectAppStoreConnect(org.slug, ascInput())).toMatchObject({ ok: true, data: { status: "error", errorCategory: "invalid_credentials" } });
      const db = await getDb();
      const [installation] = await db.select().from(integrationInstallations);
      expect(installation).toMatchObject({ status: "error", lastErrorCategory: "invalid_credentials" });
      expect(JSON.stringify(installation)).not.toContain("secret-ish");
      const creds = await db.select().from(credentialVersions);
      expect(creds.every((c) => c.destroyedAt && c.sealed.ct === "")).toBe(true);

      stubFetch(() => {
        throw new Error("network down https://api.appstoreconnect.apple.com?token=abc");
      });
      expect(await connectAppStoreConnect(org.slug, ascInput())).toMatchObject({ ok: true, data: { status: "error", errorCategory: "provider_unreachable" } });
    });

    it("validates fields and the key format before any provider call", async () => {
      const { org, owner } = await makeOrg();
      await signInAs(owner.id);
      const fetchMock = stubFetch(() => json({}));
      expect(await connectAppStoreConnect(org.slug, { issuerId: "nope", keyId: "short", privateKey: "" })).toMatchObject({
        ok: false,
        code: "validation",
        fieldErrors: { issuerId: expect.any(String), keyId: expect.any(String), privateKey: expect.any(String) },
      });
      const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString();
      expect(await connectAppStoreConnect(org.slug, ascInput(rsa))).toMatchObject({ ok: false, fieldErrors: { privateKey: expect.any(String) } });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(signAppStoreConnectToken({ issuerId: "i", keyId: "k", key: parseP8(p8())! }).split(".")).toHaveLength(3);
    });
  });

  describe("authorization of integration changes", () => {
    it("forbids members, hides other orgs, and requires recent auth and a verified email", async () => {
      const { org, owner } = await makeOrg();
      const member = await addMember(org.id, "member");
      const { org: otherOrg } = await makeOrg();
      const fetchMock = stubFetch(() => json({ data: [] }));

      await signInAs(member.id);
      expect(await connectAppStoreConnect(org.slug, ascInput())).toMatchObject({ ok: false, code: "forbidden" });
      expect(await connectGooglePlay(org.slug, { packageName: "com.example.app", bucketId: "pubsite_prod_123456789" })).toMatchObject({ ok: false, code: "forbidden" });
      expect(await disconnectIntegration(org.slug, "meta_ads")).toMatchObject({ ok: false, code: "forbidden" });

      await signInAs(owner.id);
      expect(await connectGooglePlay(otherOrg.slug, { packageName: "com.example.app", bucketId: "pubsite_prod_123456789" })).toMatchObject({ ok: false, code: "not_found" });

      await staleRecentAuth(owner.id);
      expect(await connectAppStoreConnect(org.slug, ascInput())).toMatchObject({ ok: false, code: "requires_recent_auth" });
      expect(await connectGooglePlay(org.slug, { packageName: "com.example.app", bucketId: "pubsite_prod_123456789" })).toMatchObject({ ok: false, code: "requires_recent_auth" });
      expect(await disconnectIntegration(org.slug, "google_play")).toMatchObject({ ok: false, code: "requires_recent_auth" });

      const unverified = await addMember(org.id, "owner", await makeUser({ emailVerifiedAt: null }));
      await signInAs(unverified.id);
      expect(await connectAppStoreConnect(org.slug, ascInput())).toMatchObject({ ok: false, code: "requires_verified_email" });

      expect(fetchMock).not.toHaveBeenCalled();
      const db = await getDb();
      expect(await db.select().from(integrationInstallations)).toHaveLength(0);
    });

    it("step-up checks the password and marks the session", async () => {
      const user = await makeUser({ passwordHash: await hashPassword("correct horse battery") });
      const { org } = await makeOrg({ owner: user });
      await signInAs(user.id);
      await staleRecentAuth(user.id);
      expect(await confirmRecentAuth(org.slug, "wrong password!")).toMatchObject({ ok: false, code: "requires_recent_auth", fieldErrors: { password: expect.any(String) } });
      expect(await connectGooglePlay(org.slug, { packageName: "com.example.app", bucketId: "pubsite_prod_123456789" })).toMatchObject({ code: "requires_recent_auth" });
      expect(await confirmRecentAuth(org.slug, "correct horse battery")).toMatchObject({ ok: true });
      expect(await connectGooglePlay(org.slug, { packageName: "com.example.app", bucketId: "pubsite_prod_123456789" })).toMatchObject({ ok: true });
    });
  });

  describe("Google Play", () => {
    it("stores the public mapping as awaiting verification, never connected", async () => {
      const { org, owner } = await makeOrg();
      await signInAs(owner.id);
      expect(await connectGooglePlay(org.slug, { packageName: "com.example.app", bucketId: "gs://pubsite_prod_rev_0123456789/stats/installs/" })).toMatchObject({
        ok: true,
        data: { status: "verifying" },
      });
      const overview = (await loadIntegrationsOverview(org.id)).find((o) => o.provider === "google_play")!;
      expect(overview.displayStatus).toBe("verifying");
      expect(overview.installation?.publicConfig).toEqual({ packageName: "com.example.app", bucketId: "pubsite_prod_rev_0123456789" });

      expect(await connectGooglePlay(org.slug, { packageName: "example", bucketId: "my-bucket" })).toMatchObject({
        ok: false,
        fieldErrors: { packageName: expect.any(String), bucketId: expect.any(String) },
      });
    });

    it("is unavailable when this product's service account isn't configured", async () => {
      configure({ CREDENTIALS_ENCRYPTION_KEY: encryptionKey });
      const { org, owner } = await makeOrg();
      await signInAs(owner.id);
      expect(await connectGooglePlay(org.slug, { packageName: "com.example.app", bucketId: "pubsite_prod_123456789" })).toMatchObject({ ok: false, code: "not_configured" });
      const overview = (await loadIntegrationsOverview(org.id)).find((o) => o.provider === "google_play")!;
      expect(overview).toMatchObject({ configured: false, displayStatus: "not_configured" });
    });
  });

  describe("disconnect", () => {
    async function connectedMeta(orgId: string, userId: string) {
      const db = await getDb();
      return db.transaction(async (tx) => {
        const ref = await beginGeneration(tx, orgId, "meta_ads", { status: "connected", connectedByUserId: userId, grantedScopes: ["ads_read"] });
        await storeCredential(tx, { orgId, installationId: ref.id, provider: "meta_ads", generation: ref.generation }, { accessToken: "tok", expiresAt: null });
        return ref;
      });
    }

    it("disables locally first, then revokes at the provider", async () => {
      const { org, owner } = await makeOrg();
      await signInAs(owner.id);
      await connectedMeta(org.id, owner.id);
      const calls: string[] = [];
      stubFetch((url, init) => {
        calls.push(`${init?.method} ${url.pathname}`);
        return json({ success: true });
      });
      expect(await disconnectIntegration(org.slug, "meta_ads")).toMatchObject({ ok: true, data: { outcome: "disconnected" } });
      expect(calls).toEqual(["DELETE /v24.0/me/permissions"]);
      const db = await getDb();
      const [installation] = await db.select().from(integrationInstallations);
      expect(installation).toMatchObject({ status: "disconnected", generation: 2 });
      expect((await db.select().from(credentialVersions)).every((c) => c.destroyedAt)).toBe(true);
      expect((await loadIntegrationsOverview(org.id)).find((o) => o.provider === "meta_ads")?.displayStatus).toBe("not_connected");
      expect((await db.select({ action: auditLog.action }).from(auditLog)).map((a) => a.action)).toEqual(expect.arrayContaining(["integration.disconnect", "integration.revoked"]));
      // Already disconnected → not found.
      expect(await disconnectIntegration(org.slug, "meta_ads")).toMatchObject({ ok: false, code: "not_found" });
    });

    it("keeps revocation_pending when the provider revocation fails", async () => {
      const { org, owner } = await makeOrg();
      await signInAs(owner.id);
      await connectedMeta(org.id, owner.id);
      stubFetch(() => json({ error: "nope" }, 500));
      expect(await disconnectIntegration(org.slug, "meta_ads")).toMatchObject({ ok: true, data: { outcome: "revocation_pending" } });
      const db = await getDb();
      const [installation] = await db.select().from(integrationInstallations);
      expect(installation).toMatchObject({ status: "revocation_pending", lastErrorCategory: "revocation_failed" });
      expect((await db.select().from(credentialVersions)).every((c) => c.destroyedAt)).toBe(true);

      // Acknowledging clears it without another provider call.
      const fetchMock = stubFetch(() => json({}));
      expect(await disconnectIntegration(org.slug, "meta_ads")).toMatchObject({ ok: true, data: { outcome: "disconnected" } });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("cannot touch another org's installation", async () => {
      const { org, owner } = await makeOrg();
      const other = await makeOrg();
      await connectedMeta(other.org.id, other.owner.id);
      await signInAs(owner.id);
      expect(await disconnectIntegration(org.slug, "meta_ads")).toMatchObject({ ok: false, code: "not_found" });
      expect(await disconnectIntegration(other.org.slug, "meta_ads")).toMatchObject({ ok: false, code: "not_found" });
      const db = await getDb();
      expect((await db.select().from(integrationInstallations))[0].status).toBe("connected");
    });
  });

  it("derives display status from configuration and stored state", () => {
    expect(displayStatusFor(false, null)).toBe("not_configured");
    expect(displayStatusFor(true, null)).toBe("not_connected");
    expect(displayStatusFor(true, { status: "disconnected" })).toBe("not_connected");
    expect(displayStatusFor(false, { status: "connected" })).toBe("connected");
    expect(displayStatusFor(true, { status: "revocation_pending" })).toBe("revocation_pending");
  });
});
