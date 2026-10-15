import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { createTestDb } from "../../tests/support/db";
import { addDailyMetric, addObservation, makeCampaign, makeCreator, makeOrg, makePost, makeUser } from "../../tests/support/factories";
import { getDb } from "./db/client";
import { integrationInstallations, userFlags } from "./db/schema";
import { loadActiveCampaigns, loadAdReportingState, loadHomeMetrics, loadOrganicSummary, loadRecentPosts, loadRollingCounters, loadShellState } from "./home";

const range = { from: "2026-10-01", to: "2026-10-07" };

async function addInstallation(orgId: string, provider: "meta_ads" | "tiktok_ads" | "app_store_connect", status: typeof integrationInstallations.$inferInsert.status) {
  const db = await getDb();
  await db.insert(integrationInstallations).values({ id: newId("int"), orgId, provider, status });
}

describe("home data", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it("reports a genuinely empty workspace as confirmed zeros and empty lists", async () => {
    const { org } = await makeOrg();
    const counters = await loadRollingCounters(org.id);
    expect(counters.last24h).toEqual({ status: "available", value: 0, observedThrough: null });
    expect(counters.last60m).toEqual({ status: "available", value: 0, observedThrough: null });

    const metrics = await loadHomeMetrics(org.id, range);
    if (metrics.organic.status !== "available") throw new Error("expected organic views to be available");
    expect(metrics.organic.totalViews).toBe(0);
    expect(metrics.organic.series).toHaveLength(7);
    expect(metrics.organic.series.every((p) => p.views === 0)).toBe(true);
    expect(metrics.ads).toEqual({ status: "not_connected" });
    expect(metrics.activeCampaigns).toEqual([]);
    expect(metrics.campaignCount).toBe(0);
    expect(metrics.posts).toEqual({ totalInRange: 0, workspaceHasPosts: false, items: [] });
  });

  it("marks rolling views unavailable (never zero) when posts exist but no metric source has reported", async () => {
    const { org } = await makeOrg();
    const creator = await makeCreator();
    const campaign = await makeCampaign(org.id);
    await makePost(org.id, creator.id, { campaignId: campaign.id });
    const counters = await loadRollingCounters(org.id);
    expect(counters.last24h.status).toBe("unavailable");
    expect(counters.last60m.status).toBe("unavailable");
    if (counters.last24h.status === "unavailable") expect(counters.last24h.reason).toMatch(/no metrics source/i);
    const organic = await loadOrganicSummary(org.id, range);
    expect(organic).toEqual({ status: "unavailable", reason: expect.stringMatching(/no metrics source/i) });
  });

  it("reports a period without views as a confirmed zero once any metrics have been recorded", async () => {
    const { org } = await makeOrg();
    const creator = await makeCreator();
    const campaign = await makeCampaign(org.id);
    const post = await makePost(org.id, creator.id, { campaignId: campaign.id });
    await addDailyMetric(post, "2026-09-01", 400, 0);
    const organic = await loadOrganicSummary(org.id, range);
    expect(organic.status).toBe("available");
    if (organic.status === "available") expect(organic.totalViews).toBe(0);
  });

  it("computes rolling views from observations with their freshness", async () => {
    const { org } = await makeOrg();
    const creator = await makeCreator();
    const campaign = await makeCampaign(org.id);
    const post = await makePost(org.id, creator.id, { campaignId: campaign.id });
    const now = new Date("2026-10-07T12:00:00.000Z");
    await addObservation(post, new Date("2026-10-06T10:00:00.000Z"), 1_000);
    await addObservation(post, new Date("2026-10-07T11:00:00.000Z"), 1_500);
    await addObservation(post, new Date("2026-10-07T11:50:00.000Z"), 1_600);
    const counters = await loadRollingCounters(org.id, now);
    expect(counters.last24h).toEqual({ status: "available", value: 600, observedThrough: new Date("2026-10-07T11:50:00.000Z") });
    expect(counters.last60m).toMatchObject({ status: "available", value: 100 });
  });

  it("summarizes organic views per UTC day and lists active campaigns with earnings only", async () => {
    const { org } = await makeOrg();
    const { org: other } = await makeOrg();
    const creator = await makeCreator();
    const active = await makeCampaign(org.id, { name: "Earning", status: "active" });
    const activeNoSpend = await makeCampaign(org.id, { name: "Active without spend", status: "active" });
    const paused = await makeCampaign(org.id, { name: "Paused", status: "paused" });
    const theirs = await makeCampaign(other.id, { name: "Their campaign", status: "active" });

    const p1 = await makePost(org.id, creator.id, { campaignId: active.id });
    const p2 = await makePost(org.id, creator.id, { campaignId: activeNoSpend.id });
    const p3 = await makePost(org.id, creator.id, { campaignId: paused.id });
    const rejected = await makePost(org.id, creator.id, { campaignId: active.id, reviewStatus: "rejected" });
    const foreign = await makePost(other.id, creator.id, { campaignId: theirs.id });
    await addDailyMetric(p1, "2026-10-02", 1_000, 250);
    await addDailyMetric(p1, "2026-10-04", 3_000, 750);
    await addDailyMetric(p1, "2026-09-20", 99_000, 9_900); // outside the range
    await addDailyMetric(p2, "2026-10-03", 500, 0);
    await addDailyMetric(p3, "2026-10-03", 700, 175);
    await addDailyMetric(rejected, "2026-10-03", 50_000, 5_000);
    await addDailyMetric(foreign, "2026-10-03", 80_000, 8_000);

    const metrics = await loadHomeMetrics(org.id, range);
    if (metrics.organic.status !== "available") throw new Error("expected organic views to be available");
    expect(metrics.organic.totalViews).toBe(5_200);
    expect(metrics.organic.series.find((p) => p.day === "2026-10-04")?.views).toBe(3_000);
    expect(metrics.organic.series.find((p) => p.day === "2026-10-05")?.views).toBe(0);
    expect(metrics.campaignCount).toBe(3);
    expect(await loadActiveCampaigns(org.id, range)).toEqual([{ id: active.id, name: "Earning", spendCents: 1_000, views: 4_000 }]);
  });

  it("distinguishes 'no posts at all' from 'no posts in this period'", async () => {
    const { org } = await makeOrg();
    const creator = await makeCreator();
    const campaign = await makeCampaign(org.id);
    await makePost(org.id, creator.id, { campaignId: campaign.id, postedAt: new Date("2026-08-01T00:00:00.000Z") });
    const outside = await loadRecentPosts(org.id, range);
    expect(outside).toMatchObject({ totalInRange: 0, workspaceHasPosts: true, items: [] });

    const inRange = await makePost(org.id, creator.id, { campaignId: campaign.id, postedAt: new Date("2026-10-03T08:00:00.000Z") });
    const within = await loadRecentPosts(org.id, range);
    expect(within.totalInRange).toBe(1);
    expect(within.items.map((p) => p.content_id)).toEqual([inRange.id]);
  });

  it("never reports ad numbers: not connected, needs attention, or reporting unavailable", async () => {
    const { org } = await makeOrg();
    await addInstallation(org.id, "app_store_connect", "connected");
    expect(await loadAdReportingState(org.id)).toEqual({ status: "not_connected" });

    await addInstallation(org.id, "tiktok_ads", "reauthorization_required");
    expect(await loadAdReportingState(org.id)).toEqual({ status: "needs_attention", providers: ["tiktok_ads"] });

    await addInstallation(org.id, "meta_ads", "connected");
    expect(await loadAdReportingState(org.id)).toEqual({ status: "reporting_unavailable", providers: ["meta_ads"] });

    const { org: other } = await makeOrg();
    expect(await loadAdReportingState(other.id)).toEqual({ status: "not_connected" });
  });

  it("loads shell preferences with defaults and remembers the last opened workspace", async () => {
    const user = await makeUser();
    const { org } = await makeOrg({ owner: user });
    const db = await getDb();
    expect(await loadShellState(user.id, org.id)).toEqual({ sidebarCollapsed: false, messagesDockState: "minimized" });
    const [flags] = await db.select().from(userFlags).where(eq(userFlags.userId, user.id));
    expect(flags.lastOrgId).toBe(org.id);

    await db.update(userFlags).set({ sidebarCollapsed: true, messagesDockState: "docked" }).where(eq(userFlags.userId, user.id));
    const { org: second } = await makeOrg({ owner: user });
    expect(await loadShellState(user.id, second.id)).toEqual({ sidebarCollapsed: true, messagesDockState: "docked" });
    const [after] = await db.select().from(userFlags).where(eq(userFlags.userId, user.id));
    expect(after).toMatchObject({ lastOrgId: second.id, sidebarCollapsed: true, messagesDockState: "docked" });
  });
});
