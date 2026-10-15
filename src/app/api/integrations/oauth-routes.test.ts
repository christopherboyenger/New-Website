import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createTestDb } from "../../../../tests/support/db";
import { makeOrg, makeUser } from "../../../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../../../tests/support/request-context";
import { resetEnvForTesting } from "@/server/env";
import { GET as callback } from "./[provider]/callback/route";
import { POST as start } from "./[provider]/start/route";

const KEYS = ["CREDENTIALS_ENCRYPTION_KEY", "TIKTOK_BUSINESS_APP_ID", "TIKTOK_BUSINESS_APP_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

function post(provider: string, form: Record<string, string>, headers: Record<string, string> = { origin: "http://localhost" }) {
  return start(new Request(`http://localhost/api/integrations/${provider}/start`, { method: "POST", body: new URLSearchParams(form), headers }), {
    params: Promise.resolve({ provider }),
  });
}

describe("OAuth route handlers", () => {
  beforeEach(async () => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.TIKTOK_BUSINESS_APP_ID = "tt-app";
    process.env.TIKTOK_BUSINESS_APP_SECRET = "tt-secret";
    resetEnvForTesting();
    await createTestDb();
    resetRequestContext();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    resetEnvForTesting();
  });

  it("redirects an owner to the provider and refuses cross-site posts", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const response = await post("tiktok_ads", { org: org.slug });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/^https:\/\/business-api\.tiktok\.com\/portal\/auth\?/);
    expect(response.headers.get("cache-control")).toBe("no-store");

    expect((await post("tiktok_ads", { org: org.slug }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post("tiktok_ads", { org: org.slug }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
  });

  it("404s unknown providers and non-members; returns refusals to the card", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    expect((await post("google_play", { org: org.slug })).status).toBe(404);
    expect((await post("tiktok_ads", { org: "../evil" })).status).toBe(404);

    delete process.env.TIKTOK_BUSINESS_APP_ID;
    resetEnvForTesting();
    const refused = await post("tiktok_ads", { org: org.slug });
    expect(refused.status).toBe(303);
    expect(refused.headers.get("location")).toBe(`http://localhost/home/${org.slug}/integrations?integration=tiktok_ads&result=not_configured#tiktok_ads`);

    await signInAs((await makeUser()).id);
    expect((await post("tiktok_ads", { org: org.slug })).status).toBe(404);
  });

  it("sends unknown callbacks home without touching anything", async () => {
    const response = await callback(new Request("http://localhost/api/integrations/meta_ads/callback?state=forged&code=abc"), {
      params: Promise.resolve({ provider: "meta_ads" }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/home");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const unknown = await callback(new Request("http://localhost/api/integrations/x/callback"), { params: Promise.resolve({ provider: "x" }) });
    expect(unknown.status).toBe(404);
  });
});
