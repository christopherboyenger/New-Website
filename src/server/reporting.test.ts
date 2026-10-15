import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/support/db";
import { addDailyMetric, addObservation, makeCampaign, makeCreator, makeOrg, makePlaybook, makePost } from "../../tests/support/factories";
import { blendInstalls, dailyReport, queryPosts, rollingViews } from "./reporting";

const range = { from: "2026-10-01", to: "2026-10-07" };

describe("reporting", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it("recomputes period CPM from totals, deduplicates creators, and ignores unapproved posts", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const pb = await makePlaybook(org.id, campaign.id);
    const creator = await makeCreator();
    const a = await makePost(org.id, creator.id, { campaignId: campaign.id, playbookId: pb.id });
    const b = await makePost(org.id, creator.id, { campaignId: campaign.id, playbookId: null });
    const rejected = await makePost(org.id, creator.id, { campaignId: campaign.id, reviewStatus: "rejected" });
    await addDailyMetric(a, "2026-10-01", 1000, 100); // $1.00
    await addDailyMetric(a, "2026-10-02", 9000, 900);
    await addDailyMetric(b, "2026-10-02", 1000, 1000); // $10 for 1k views
    await addDailyMetric(rejected, "2026-10-02", 50_000, 5000);

    const report = await dailyReport(org.id, { range, groupBy: [] });
    expect(report.totals.views).toBe(11_000);
    expect(report.totals.spend).toBe(20);
    // Weighted: $20 / 11,000 views * 1000 — not the mean of the daily CPMs.
    expect(report.totals.cpm).toBeCloseTo(20 / 11, 6);
    expect(report.totals.posts).toBe(2);
    expect(report.totals.creators).toBe(1);
    expect(report.data.map((r) => r.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(report.meta.timezone).toBe("UTC");
  });

  it("labels Custom Posts with the playbook sentinel 0 when grouped by playbook", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const creator = await makeCreator();
    const custom = await makePost(org.id, creator.id, { campaignId: campaign.id, playbookId: null });
    await addDailyMetric(custom, "2026-10-03", 10);
    const report = await dailyReport(org.id, { range, groupBy: ["playbook"] });
    expect(report.data[0]).toMatchObject({ playbook_id: "0", playbook_name: "Custom Posts", views: 10 });
  });

  it("never returns another organization's data", async () => {
    const { org: mine } = await makeOrg();
    const { org: theirs } = await makeOrg();
    const creator = await makeCreator();
    const c = await makeCampaign(theirs.id);
    const p = await makePost(theirs.id, creator.id, { campaignId: c.id });
    await addDailyMetric(p, "2026-10-02", 999, 99);
    const report = await dailyReport(mine.id, { range, groupBy: [] });
    expect(report.totals.views).toBe(0);
    const page = await queryPosts(mine.id, { range, mode: "active", page: 1, pageSize: 25, sort: "posted", order: "desc" });
    expect(page.meta.total).toBe(0);
  });

  it("separates created-in-range from active-in-range and excludes unattributed posts unless requested", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const creator = await makeCreator();
    const old = await makePost(org.id, creator.id, { campaignId: campaign.id, postedAt: new Date("2026-08-01T12:00:00Z") });
    const fresh = await makePost(org.id, creator.id, { campaignId: campaign.id, postedAt: new Date("2026-10-07T23:59:00Z") });
    const unattributed = await makePost(org.id, creator.id, { campaignId: null, postedAt: new Date("2026-10-03T00:00:00Z") });
    await addDailyMetric(old, "2026-10-04", 500);

    const base = { range, page: 1, pageSize: 25, sort: "posted" as const, order: "desc" as const };
    const created = await queryPosts(org.id, { ...base, mode: "created" });
    expect(created.data.map((p) => p.content_id)).toEqual([fresh.id]);

    const active = await queryPosts(org.id, { ...base, mode: "active" });
    expect(active.data.map((p) => p.content_id)).toEqual([old.id]);
    expect(active.data[0].range_views).toBe(500);

    const withUnattributed = await queryPosts(org.id, { ...base, mode: "created", campaignIds: [campaign.id, "0"] });
    expect(withUnattributed.data.map((p) => p.content_id).sort()).toEqual([fresh.id, unattributed.id].sort());
    expect(withUnattributed.data.find((p) => p.content_id === unattributed.id)?.campaign_id).toBe("0");
  });

  it("paginates and sorts server-side with a page-size cap of 100", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const creator = await makeCreator();
    for (let i = 0; i < 5; i++) {
      const p = await makePost(org.id, creator.id, { campaignId: campaign.id, views: i * 10, postedAt: new Date("2026-10-02T00:00:00Z") });
      await addDailyMetric(p, "2026-10-02", i);
    }
    const page = await queryPosts(org.id, { range, mode: "created", page: 2, pageSize: 2, sort: "views", order: "desc" });
    expect(page.meta.total).toBe(5);
    expect(page.data.map((p) => p.views)).toEqual([20, 10]);
    const capped = await queryPosts(org.id, { range, mode: "created", page: 1, pageSize: 1000, sort: "posted", order: "desc" });
    expect(capped.meta.page_size).toBe(100);
  });

  it("reports rolling views as unavailable when posts have no metric source, and zero for an empty workspace", async () => {
    const { org } = await makeOrg();
    expect(await rollingViews(org.id, 60)).toMatchObject({ status: "available", value: 0 });
    const creator = await makeCreator();
    const campaign = await makeCampaign(org.id);
    const p = await makePost(org.id, creator.id, { campaignId: campaign.id });
    expect((await rollingViews(org.id, 60)).status).toBe("unavailable");

    const now = new Date("2026-10-07T12:00:00Z");
    await addObservation(p, new Date("2026-10-07T10:30:00Z"), 1000);
    await addObservation(p, new Date("2026-10-07T11:30:00Z"), 1500);
    await addObservation(p, new Date("2026-10-07T11:50:00Z"), 1400); // platform correction: never negative
    const result = await rollingViews(org.id, 60, now);
    expect(result).toMatchObject({ status: "available", value: 400 });
  });

  it("blends installs: store actuals win, estimates only fill gaps", () => {
    expect(blendInstalls(new Map([["app_store", 10], ["noise", 99]]))).toEqual({ value: 10, source: "store" });
    expect(blendInstalls(new Map([["app_store", 10], ["play_store", 5]]))).toEqual({ value: 15, source: "store" });
    expect(blendInstalls(new Map([["noise", 7]]))).toEqual({ value: 7, source: "estimated" });
    expect(blendInstalls(new Map())).toBeNull();
  });
});
