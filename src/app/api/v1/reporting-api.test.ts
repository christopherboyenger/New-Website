import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/support/db";
import { addDailyMetric, makeCampaign, makeCreator, makeOrg, makePlaybook, makePost } from "../../../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../../../tests/support/request-context";
import { createApiGrant, revokeApiGrant } from "@/server/api-grants";
import { getDb } from "@/server/db/client";
import { installObservations } from "@/server/db/schema";
import { API_RATE_LIMIT } from "@/server/integrations/reporting-api";
import { consumeRateLimit } from "@/server/rate-limit";
import { GET as getCampaigns } from "./campaigns/route";
import { GET as getPlaybooks } from "./playbooks/route";
import { GET as getPosts } from "./posts/route";
import { GET as getDaily } from "./reports/daily/route";

async function tokenFor(slug: string, ownerId: string, scopes: string[] = ["reports:read", "campaigns:read", "playbooks:read"]) {
  await signInAs(ownerId);
  const result = await createApiGrant(slug, { label: "test", scopes, expiry: "30" });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function call(handler: (r: Request) => Promise<Response>, path: string, token?: string) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return handler(new Request(`http://localhost/api/v1${path}`, { headers }));
}

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown> & { error?: { code: string; message: string } };
}

const range = "start_date=2026-09-01&end_date=2026-09-30";

describe("Reporting API route handlers", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("returns 401 for missing, invalid and revoked tokens", async () => {
    const { org, owner } = await makeOrg();
    const missing = await call(getDaily, `/reports/daily?${range}`);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");
    expect((await body(missing)).error?.code).toBe("unauthorized");
    expect((await call(getDaily, `/reports/daily?${range}`, "rk_nottoken_abcdefghijklmnop")).status).toBe(401);

    const { token, grant } = await tokenFor(org.slug, owner.id);
    expect((await call(getDaily, `/reports/daily?${range}`, token)).status).toBe(200);
    await revokeApiGrant(org.slug, { id: grant.id });
    expect((await call(getDaily, `/reports/daily?${range}`, token)).status).toBe(401);
  });

  it("returns 403 when the token lacks the endpoint's scope", async () => {
    const { org, owner } = await makeOrg();
    const { token } = await tokenFor(org.slug, owner.id, ["campaigns:read"]);
    const denied = await call(getPosts, `/posts?${range}`, token);
    expect(denied.status).toBe(403);
    expect((await body(denied)).error?.code).toBe("insufficient_scope");
    expect((await call(getPlaybooks, "/playbooks", token)).status).toBe(403);
    const ok = await call(getCampaigns, "/campaigns", token);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
  });

  it("validates parameters with 400 and a uniform error envelope", async () => {
    const { org, owner } = await makeOrg();
    const { token } = await tokenFor(org.slug, owner.id);
    const cases: Array<[(r: Request) => Promise<Response>, string]> = [
      [getDaily, "/reports/daily"],
      [getDaily, "/reports/daily?start_date=2026-09-31&end_date=2026-10-01"],
      [getDaily, "/reports/daily?start_date=2026-09-10&end_date=2026-09-01"],
      [getDaily, "/reports/daily?start_date=2025-01-01&end_date=2026-09-01"],
      [getDaily, `/reports/daily?${range}&group_by=creator`],
      [getDaily, `/reports/daily?${range}&metrics=views,reach`],
      [getDaily, `/reports/daily?${range}&campaign_id=1;drop`],
      [getDaily, `/reports/daily?${range}&campaign_id=a&campaign_id=b`],
      [getDaily, `/reports/daily?${range}&org_id=org_abc`],
      [getPosts, `/posts?${range}&page_size=101`],
      [getPosts, `/posts?${range}&page=0`],
      [getPosts, `/posts?${range}&mode=all`],
      [getPosts, `/posts?${range}&sort=random`],
      [getPosts, `/posts?${range}&order=up`],
    ];
    for (const [handler, path] of cases) {
      const response = await call(handler, path, token);
      expect(response.status, path).toBe(400);
      const json = await body(response);
      expect(json.error?.code, path).toBe("invalid_request");
      expect(typeof json.error?.message).toBe("string");
      expect(response.headers.get("x-ratelimit-limit")).toBe(String(API_RATE_LIMIT.limit));
    }
  });

  it("rate limits per grant with headers and 429", async () => {
    const { org, owner } = await makeOrg();
    const { token, grant } = await tokenFor(org.slug, owner.id);
    const first = await call(getCampaigns, "/campaigns", token);
    expect(first.headers.get("x-ratelimit-limit")).toBe(String(API_RATE_LIMIT.limit));
    expect(first.headers.get("x-ratelimit-remaining")).toBe(String(API_RATE_LIMIT.limit - 1));
    expect(Number(first.headers.get("x-ratelimit-reset"))).toBeGreaterThan(Date.now() / 1000);

    for (let i = 1; i < API_RATE_LIMIT.limit; i++) await consumeRateLimit(`api:grant:${grant.id}`, API_RATE_LIMIT.limit, API_RATE_LIMIT.windowSeconds);
    const limited = await call(getCampaigns, "/campaigns", token);
    expect(limited.status).toBe(429);
    expect((await body(limited)).error?.code).toBe("rate_limited");
    expect(limited.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    // Another token (even in the same org) has its own budget.
    const other = await tokenFor(org.slug, owner.id);
    expect((await call(getCampaigns, "/campaigns", other.token)).status).toBe(200);
  });

  it("serves daily reports, posts and choices for the token's org only", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id, { name: "Fall launch" });
    const playbook = await makePlaybook(org.id, campaign.id, { name: "Unboxing" });
    const creator = await makeCreator();
    const post = await makePost(org.id, creator.id, { campaignId: campaign.id, playbookId: playbook.id, postedAt: new Date("2026-09-02T10:00:00Z"), views: 900 });
    const unattributed = await makePost(org.id, creator.id, { postedAt: new Date("2026-09-03T10:00:00Z") });
    await addDailyMetric(post, "2026-09-02", 600, 900);
    await addDailyMetric(post, "2026-09-03", 300, 0);
    await addDailyMetric(unattributed, "2026-09-03", 100, 0);
    const db = await getDb();
    await db.insert(installObservations).values({ orgId: org.id, day: "2026-09-02", source: "estimate", installs: 40, provenance: "test fixture" });

    // A second org with its own data must never leak.
    const other = await makeOrg();
    const otherCampaign = await makeCampaign(other.org.id, { name: "Other brand" });
    const otherPost = await makePost(other.org.id, creator.id, { campaignId: otherCampaign.id, postedAt: new Date("2026-09-02T10:00:00Z") });
    await addDailyMetric(otherPost, "2026-09-02", 5000, 5000);

    const { token } = await tokenFor(org.slug, owner.id);

    const daily = await body(await call(getDaily, `/reports/daily?${range}`, token));
    expect(daily.meta).toMatchObject({ start_date: "2026-09-01", end_date: "2026-09-30", timezone: "UTC", group_by: ["date"] });
    expect(daily.totals).toMatchObject({ views: 1000, spend: 9, posts: 2, creators: 1, estimated_installs: 40, installs_source: "estimated" });
    const rows = daily.data as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.date)).toEqual(["2026-09-02", "2026-09-03"]);
    expect(rows[0]).toMatchObject({ views: 600, cpm: 15, installs_by_source: { estimate: 40 } });

    const grouped = await body(await call(getDaily, `/reports/daily?${range}&group_by=campaign&campaign_id=0,${campaign.id}&metrics=views`, token));
    const groupedRows = grouped.data as Array<Record<string, unknown>>;
    expect(groupedRows).toContainEqual({ date: "2026-09-03", campaign_id: "0", campaign_name: "Unattributed", views: 100 });
    expect(groupedRows.every((r) => !("estimated_installs" in r))).toBe(true);
    // Filtering by another org's campaign returns nothing from that org.
    const foreign = await body(await call(getDaily, `/reports/daily?${range}&campaign_id=${otherCampaign.id}&metrics=views,posts`, token));
    expect(foreign.data).toEqual([]);
    expect(foreign.totals).toMatchObject({ views: 0, posts: 0 });

    const posts = await body(await call(getPosts, `/posts?${range}&page_size=100`, token));
    const postRows = posts.data as Array<Record<string, unknown>>;
    // Omitting campaign_id excludes unattributed posts.
    expect(postRows.map((p) => p.content_id)).toEqual([post.id]);
    expect(postRows[0]).toMatchObject({ range_views: 900, spend: 9, playbook_name: "Unboxing" });
    expect(postRows[0]).not.toHaveProperty("review_status");
    expect(posts.meta).toMatchObject({ page: 1, page_size: 100, total: 1, order: "desc", sort: "posted" });
    const withUnattributed = await body(await call(getPosts, `/posts?${range}&campaign_id=0`, token));
    expect((withUnattributed.data as Array<{ content_id: string }>).map((p) => p.content_id)).toEqual([unattributed.id]);

    const campaigns = await body(await call(getCampaigns, "/campaigns", token));
    expect(campaigns.data).toEqual([{ id: campaign.id, name: "Fall launch", active: expect.any(Boolean) }]);
    const playbooks = await body(await call(getPlaybooks, "/playbooks", token));
    expect((playbooks.data as Array<{ id: string }>).map((p) => p.id)).toEqual([playbook.id]);

    const otherToken = await tokenFor(other.org.slug, other.owner.id);
    const otherDaily = await body(await call(getDaily, `/reports/daily?${range}&metrics=views`, otherToken.token));
    expect(otherDaily.totals).toEqual({ views: 5000 });
  });
});
