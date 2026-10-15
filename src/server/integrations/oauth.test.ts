import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/support/db";
import { addMember, makeOrg, makeUser } from "../../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../../tests/support/request-context";
import { getDb } from "../db/client";
import { credentialVersions, integrationInstallations, memberships, oauthAttempts, sessions } from "../db/schema";
import { tokenDigest } from "../crypto";
import { resetEnvForTesting } from "../env";
import { loadCurrentCredential } from "./credentials";
import { completeOAuth, OAUTH_ATTEMPT_TTL_MS, startOAuth } from "./oauth";
import type { OAuthTokenSet } from "./providers/types";

const ENV_KEYS = ["CREDENTIALS_ENCRYPTION_KEY", "META_APP_ID", "META_APP_SECRET", "TIKTOK_BUSINESS_APP_ID", "TIKTOK_BUSINESS_APP_SECRET"] as const;
const saved: Partial<Record<string, string | undefined>> = {};

function configure(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  resetEnvForTesting();
}

const fullEnv = {
  CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  META_APP_ID: "1234567890",
  META_APP_SECRET: "meta-secret",
  TIKTOK_BUSINESS_APP_ID: "tt-app",
  TIKTOK_BUSINESS_APP_SECRET: "tt-secret",
};

/** Fake Meta Graph API: records calls and answers by path. */
function fakeMeta(opts: { granted?: string[]; accounts?: Array<{ id: string; name: string }>; exchangeFails?: boolean } = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname.endsWith("/oauth/access_token")) {
      if (opts.exchangeFails) return json({ error: { message: "bad code" } }, 400);
      return url.searchParams.get("grant_type") === "fb_exchange_token" ? json({ access_token: "long-token", expires_in: 5_184_000 }) : json({ access_token: "short-token" });
    }
    if (url.pathname.endsWith("/me/permissions") && init?.method === "DELETE") return json({ success: true });
    if (url.pathname.endsWith("/me/permissions")) return json({ data: (opts.granted ?? ["ads_read"]).map((permission) => ({ permission, status: "granted" })) });
    if (url.pathname.endsWith("/me/adaccounts")) return json({ data: opts.accounts ?? [{ id: "act_1", name: "Main account" }] });
    return json({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

async function start(slug: string, capability: "reporting" | "launch" = "reporting") {
  const outcome = await startOAuth(slug, "meta_ads", capability);
  if (!outcome.ok) throw new Error(`start refused: ${outcome.result}`);
  const url = new URL(outcome.redirectTo);
  return { url, state: url.searchParams.get("state")! };
}

async function stored(orgId: string) {
  const db = await getDb();
  return {
    installations: await db.select().from(integrationInstallations).where(eq(integrationInstallations.orgId, orgId)),
    credentials: await db.select().from(credentialVersions).where(eq(credentialVersions.orgId, orgId)),
  };
}

describe("OAuth connection flow", () => {
  beforeEach(async () => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    configure(fullEnv);
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

  it("starts with a one-use state stored only as a digest, bound to user, session, org and provider", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const { url, state } = await start(org.slug, "launch");
    expect(url.origin + url.pathname).toMatch(/^https:\/\/www\.facebook\.com\/v\d+\.\d+\/dialog\/oauth$/);
    expect(url.searchParams.get("client_id")).toBe(fullEnv.META_APP_ID);
    expect(url.searchParams.get("scope")).toBe("ads_read,ads_management");
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/api\/integrations\/meta_ads\/callback$/);
    expect(url.searchParams.has("code_challenge")).toBe(false);

    const db = await getDb();
    const [attempt] = await db.select().from(oauthAttempts);
    const [session] = await db.select().from(sessions).where(eq(sessions.userId, owner.id));
    expect(attempt).toMatchObject({ stateDigest: tokenDigest(state, "oauth_state"), userId: owner.id, sessionId: session.id, orgId: org.id, provider: "meta_ads", returnPath: `/home/${org.slug}/integrations`, consumedAt: null });
    expect(JSON.stringify(attempt)).not.toContain(state);
    expect(attempt.expiresAt.getTime() - attempt.createdAt.getTime()).toBe(OAUTH_ATTEMPT_TTL_MS);

    const tiktok = await startOAuth(org.slug, "tiktok_ads");
    expect(tiktok.ok && new URL(tiktok.redirectTo).origin + new URL(tiktok.redirectTo).pathname).toBe("https://business-api.tiktok.com/portal/auth");
  });

  it("refuses to start for members, without recent auth, or when the app isn't configured", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    expect(await startOAuth(org.slug, "meta_ads")).toMatchObject({ ok: false, result: "forbidden" });

    await signInAs(owner.id);
    const db = await getDb();
    await db.update(sessions).set({ recentAuthAt: new Date(Date.now() - 3_600_000) }).where(eq(sessions.userId, owner.id));
    expect(await startOAuth(org.slug, "meta_ads")).toMatchObject({ ok: false, result: "requires_recent_auth" });

    await signInAs(owner.id);
    configure({ ...fullEnv, META_APP_ID: undefined, META_APP_SECRET: undefined });
    expect(await startOAuth(org.slug, "meta_ads")).toMatchObject({ ok: false, result: "not_configured" });
    configure({ ...fullEnv, CREDENTIALS_ENCRYPTION_KEY: undefined });
    expect(await startOAuth(org.slug, "tiktok_ads")).toMatchObject({ ok: false, result: "not_configured" });
    expect(await db.select().from(oauthAttempts)).toHaveLength(0);

    const outsider = await makeUser();
    await signInAs(outsider.id);
    await expect(startOAuth(org.slug, "meta_ads")).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("connects after a server-side exchange and a real read, sealing the token", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const { state } = await start(org.slug);
    const { calls } = fakeMeta();

    const destination = await completeOAuth("meta_ads", new URLSearchParams({ state, code: "auth-code" }));
    expect(destination).toBe(`/home/${org.slug}/integrations?integration=meta_ads&result=connected#meta_ads`);
    expect(destination).not.toContain("auth-code");
    expect(calls).toEqual(["GET /v24.0/oauth/access_token", "GET /v24.0/oauth/access_token", "GET /v24.0/me/permissions", "GET /v24.0/me/adaccounts"]);

    const { installations, credentials } = await stored(org.id);
    expect(installations).toHaveLength(1);
    expect(installations[0]).toMatchObject({ status: "connected", connectedByUserId: owner.id, grantedScopes: ["ads_read"], selectedAssets: [{ id: "act_1", name: "Main account", kind: "ad_account" }] });
    expect(credentials).toHaveLength(1);
    expect(JSON.stringify(credentials[0].sealed)).not.toContain("long-token");
    const tokens = await loadCurrentCredential<OAuthTokenSet>({ orgId: org.id, installationId: installations[0].id, provider: "meta_ads", generation: installations[0].generation });
    expect(tokens?.accessToken).toBe("long-token");
  });

  it("marks partial grants as limited", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const { state } = await start(org.slug, "launch");
    fakeMeta({ granted: ["ads_read"] });
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state, code: "c" }))).toContain("result=limited&reason=scopes_declined");
    expect((await stored(org.id)).installations[0]).toMatchObject({ status: "limited_permissions", lastErrorCategory: "scopes_declined" });

    await signInAs(owner.id);
    const second = await start(org.slug);
    fakeMeta({ accounts: [] });
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: second.state, code: "c" }))).toContain("reason=no_eligible_assets");
    const after = await stored(org.id);
    expect(after.installations[0]).toMatchObject({ status: "limited_permissions", generation: 2 });
    // Only the newest generation's credential is live.
    expect(after.credentials.filter((c) => !c.destroyedAt)).toHaveLength(1);
  });

  it("rejects wrong, expired and replayed state without storing anything", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const { fetchMock } = fakeMeta();

    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: "not-a-real-state", code: "c" }))).toBe("/home");

    const expired = await start(org.slug);
    const later = new Date(Date.now() + OAUTH_ATTEMPT_TTL_MS + 1000);
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: expired.state, code: "c" }), later)).toContain("result=expired");

    const { state } = await start(org.slug);
    expect(await completeOAuth("tiktok_ads", new URLSearchParams({ state, code: "c" }))).toContain("result=failed");
    // The mismatched-provider attempt was consumed: replaying it on the right provider fails too.
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state, code: "c" }))).toContain("result=expired");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await stored(org.id)).toEqual({ installations: [], credentials: [] });

    const good = await start(org.slug);
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: good.state, code: "c" }))).toContain("result=connected");
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: good.state, code: "c" }))).toContain("result=expired");
    expect((await stored(org.id)).installations).toHaveLength(1);
  });

  it("rejects a different session, a different user and a revoked membership", async () => {
    const { org, owner } = await makeOrg();
    const coOwner = await addMember(org.id, "owner");
    const { fetchMock } = fakeMeta();

    await signInAs(owner.id);
    const differentSession = await start(org.slug);
    await signInAs(owner.id); // new session, same user
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: differentSession.state, code: "c" }))).toContain("result=forbidden");

    const differentUser = await start(org.slug);
    await signInAs(coOwner.id);
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: differentUser.state, code: "c" }))).toContain("result=forbidden");

    const removed = await start(org.slug);
    const db = await getDb();
    await db.update(memberships).set({ role: "member" }).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, coOwner.id)));
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: removed.state, code: "c" }))).toContain("result=forbidden");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await stored(org.id)).toEqual({ installations: [], credentials: [] });
  });

  it("treats cancelled or denied consent as no change, and failed exchanges as failures", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const { fetchMock } = fakeMeta({ exchangeFails: true });

    const cancelled = await start(org.slug);
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: cancelled.state, error: "access_denied", error_reason: "user_denied" }))).toContain("result=cancelled");
    expect(fetchMock).not.toHaveBeenCalled();

    const failing = await start(org.slug);
    expect(await completeOAuth("meta_ads", new URLSearchParams({ state: failing.state, code: "bad" }))).toContain("result=failed&reason=token_exchange_failed");
    expect(await stored(org.id)).toEqual({ installations: [], credentials: [] });
  });
});
