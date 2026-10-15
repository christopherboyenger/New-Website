import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addDailyMetric, addMember, makeCampaign, makeCreator, makeOrg, makePlaybook, makePost } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { getDb } from "./db/client";
import { playbooks } from "./db/schema";
import {
  countListedPosts,
  createPlaybookForSlug,
  listCampaignChooser,
  listCampaignRows,
  listPlaybookRows,
  loadBreakdownForSlug,
  loadDailyChart,
  loadFilterChoices,
  loadOrganicCounts,
  loadPostMetricSummary,
  loadPostsPage,
  resolveFilterLabels,
  workspaceHasPosts,
} from "./organic";

const range = { from: "2026-10-01", to: "2026-10-07" };
const noFilters = { campaign: null, playbook: null, platform: null };

describe("organic tables", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it("computes campaign metrics for the range with weighted CPM, deduplicated creators and approved posts only", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id, { name: "Launch" });
    const creator = await makeCreator();
    const other = await makeCreator();
    const a = await makePost(org.id, creator.id, { campaignId: campaign.id });
    const b = await makePost(org.id, creator.id, { campaignId: campaign.id });
    const c = await makePost(org.id, other.id, { campaignId: campaign.id });
    // CPM of the period is (100 + 900) cents / 4,000 views = $2.50, not the mean of the day CPMs ($1 and $3).
    await addDailyMetric(a, "2026-10-02", 1_000, 100);
    await addDailyMetric(b, "2026-10-03", 3_000, 900);
    // Outside the range, and a rejected post with metrics: neither counts.
    await addDailyMetric(c, "2026-09-20", 5_000, 5_000);
    const rejected = await makePost(org.id, other.id, { campaignId: campaign.id, reviewStatus: "rejected" });
    await addDailyMetric(rejected, "2026-10-02", 9_000, 9_000);

    const page = await listCampaignRows(org.id, { range, sort: "views", order: "desc", page: 1 });
    expect(page.total).toBe(1);
    expect(page.rows[0]).toMatchObject({
      id: campaign.id,
      name: "Launch",
      status: "inactive",
      views: 4_000,
      spendCents: 1_000,
      cpmUsd: 2.5,
      posts: 2,
      creators: 1,
      avgViewsPerPost: 2_000,
      dailyBudgetCents: 500_00,
      platforms: [],
    });
  });

  it("counts every attached playbook (drafts included) and reports empty campaigns as zero with no CPM", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id, { targeting: { countries: [], platforms: ["instagram", "tiktok"], ageMin: null, ageMax: null, gender: "any", metros: [], minCreatorLevel: "all" } });
    await makePlaybook(org.id, campaign.id, { status: "published", active: true });
    await makePlaybook(org.id, campaign.id);
    const [row] = (await listCampaignRows(org.id, { range, sort: "views", order: "desc", page: 1 })).rows;
    expect(row).toMatchObject({ playbooks: 2, views: 0, spendCents: 0, cpmUsd: null, posts: 0, creators: 0, avgViewsPerPost: null });
    // Platforms follow the canonical platform order.
    expect(row.platforms).toEqual(["tiktok", "instagram"]);
    expect(await loadOrganicCounts(org.id, null)).toEqual({ campaigns: 1, playbooks: 2 });
    expect(await loadOrganicCounts(org.id, campaign.id)).toEqual({ campaigns: 1, playbooks: 2 });
    expect(await loadOrganicCounts(org.id, "cmp_elsewhere")).toEqual({ campaigns: 1, playbooks: 0 });
  });

  it("isolates tenants: another workspace's campaigns, playbooks and metrics never appear", async () => {
    const mine = await makeOrg();
    const theirs = await makeOrg();
    const myCampaign = await makeCampaign(mine.org.id);
    const theirCampaign = await makeCampaign(theirs.org.id);
    await makePlaybook(theirs.org.id, theirCampaign.id);
    const creator = await makeCreator();
    const theirPost = await makePost(theirs.org.id, creator.id, { campaignId: theirCampaign.id });
    await addDailyMetric(theirPost, "2026-10-02", 7_000, 700);

    const campaignsPage = await listCampaignRows(mine.org.id, { range, sort: "views", order: "desc", page: 1 });
    expect(campaignsPage.rows.map((r) => r.id)).toEqual([myCampaign.id]);
    expect(campaignsPage.rows[0].views).toBe(0);
    expect((await listPlaybookRows(mine.org.id, { range, campaignId: null, sort: "views", order: "desc", page: 1 })).total).toBe(0);
    // Filtering by another workspace's campaign ID yields nothing (indistinguishable from a missing ID).
    expect((await listPlaybookRows(mine.org.id, { range, campaignId: theirCampaign.id, sort: "views", order: "desc", page: 1 })).rows).toEqual([]);
    const labels = await resolveFilterLabels(mine.org.id, { campaign: theirCampaign.id, playbook: null });
    expect(labels.campaign).toEqual({ id: theirCampaign.id, label: "Unknown campaign", found: false });
    const summary = await loadPostMetricSummary(mine.org.id, { ...noFilters, range, mode: "active" });
    expect(summary.range.views).toBe(0);
    expect(await listCampaignChooser(mine.org.id)).toEqual([{ id: myCampaign.id, name: myCampaign.name, status: "inactive" }]);
    expect((await loadFilterChoices(mine.org.id, null)).campaigns.map((c) => c.id)).toEqual([myCampaign.id]);
  });

  it("sorts server-side (CPM unknowns last) and paginates with a stable total", async () => {
    const { org } = await makeOrg();
    const creator = await makeCreator();
    const specs = [
      { name: "Alpha", views: 1_000, spend: 500 },
      { name: "bravo", views: 2_000, spend: 4_000 },
      { name: "Charlie", views: 0, spend: 0 },
    ];
    for (const spec of specs) {
      const campaign = await makeCampaign(org.id, { name: spec.name });
      if (spec.views) await addDailyMetric(await makePost(org.id, creator.id, { campaignId: campaign.id }), "2026-10-04", spec.views, spec.spend);
    }
    const names = async (sort: "spend" | "name" | "cpm", order: "asc" | "desc", page = 1, pageSize = 25) =>
      (await listCampaignRows(org.id, { range, sort, order, page, pageSize })).rows.map((r) => r.name);

    expect(await names("spend", "desc")).toEqual(["bravo", "Alpha", "Charlie"]);
    expect(await names("name", "asc")).toEqual(["Alpha", "bravo", "Charlie"]);
    expect(await names("cpm", "asc")).toEqual(["Alpha", "bravo", "Charlie"]);
    expect(await names("cpm", "desc")).toEqual(["bravo", "Alpha", "Charlie"]);
    const first = await listCampaignRows(org.id, { range, sort: "spend", order: "desc", page: 1, pageSize: 2 });
    const second = await listCampaignRows(org.id, { range, sort: "spend", order: "desc", page: 2, pageSize: 2 });
    expect([first.total, second.total]).toEqual([3, 3]);
    expect([...first.rows, ...second.rows].map((r) => r.name)).toEqual(["bravo", "Alpha", "Charlie"]);
  });

  it("lists playbooks with their campaign, filters by campaign and sorts distribution state", async () => {
    const { org } = await makeOrg();
    const one = await makeCampaign(org.id, { name: "One", status: "paused" });
    const two = await makeCampaign(org.id, { name: "Two" });
    const live = await makePlaybook(org.id, one.id, { name: "Live", status: "published", active: true });
    const off = await makePlaybook(org.id, one.id, { name: "Off", status: "published", active: false });
    const draft = await makePlaybook(org.id, one.id, { name: "Draft" });
    await makePlaybook(org.id, two.id, { name: "Elsewhere" });
    const creator = await makeCreator();
    await addDailyMetric(await makePost(org.id, creator.id, { campaignId: one.id, playbookId: off.id }), "2026-10-05", 4_000, 800);

    const page = await listPlaybookRows(org.id, { range, campaignId: one.id, sort: "active", order: "desc", page: 1 });
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.id)).toEqual([live.id, off.id, draft.id]);
    expect(page.rows[1]).toMatchObject({ campaignName: "One", campaignStatus: "paused", views: 4_000, spendCents: 800, cpmUsd: 2, posts: 1, format: "ugc" });
    const byViews = await listPlaybookRows(org.id, { range, campaignId: null, sort: "views", order: "desc", page: 1 });
    expect(byViews.total).toBe(4);
    expect(byViews.rows[0].id).toBe(off.id);
  });
});

describe("organic posts tab", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it("separates range metrics from lifetime counters and computes weighted engagement", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const creator = await makeCreator();
    const a = await makePost(org.id, creator.id, {
      campaignId: campaign.id,
      postedAt: new Date("2026-10-02T10:00:00Z"),
      views: 1_000,
      likes: 50,
      comments: 10,
      bookmarks: null,
      shares: 0,
    });
    const b = await makePost(org.id, creator.id, { campaignId: campaign.id, postedAt: new Date("2026-10-03T10:00:00Z"), views: 3_000, likes: 90, comments: 0, bookmarks: 0, shares: 0 });
    // Never observed: contributes to neither sums nor engagement.
    await makePost(org.id, creator.id, { campaignId: campaign.id, postedAt: new Date("2026-10-04T10:00:00Z") });
    await addDailyMetric(a, "2026-10-02", 600, 60);
    await addDailyMetric(b, "2026-10-03", 2_400, 240);

    const summary = await loadPostMetricSummary(org.id, { ...noFilters, range, mode: "created" });
    expect(summary.status).toBe("available");
    expect(summary.range).toEqual({ views: 3_000, spendCents: 300, cpmUsd: 1, posts: 2, creators: 1 });
    expect(summary.lifetime).toMatchObject({ postCount: 3, likes: 140, comments: 10, bookmarks: 0, shares: 0 });
    expect(summary.lifetime.engagement).toBeCloseTo(150 / 4_000);
  });

  it("marks metrics unavailable while approved posts await their first metrics, and never-observed counters as null", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    await makePost(org.id, (await makeCreator()).id, { campaignId: campaign.id, postedAt: new Date("2026-10-02T00:00:00Z") });
    const summary = await loadPostMetricSummary(org.id, { ...noFilters, range, mode: "created" });
    expect(summary.status).toBe("awaiting_metrics");
    expect(summary.lifetime).toMatchObject({ postCount: 1, likes: null, engagement: null });
  });

  it("lists all review statuses by default, filters by status and distinguishes an empty workspace", async () => {
    const { org } = await makeOrg();
    expect(await workspaceHasPosts(org.id)).toBe(false);
    const campaign = await makeCampaign(org.id);
    const creator = await makeCreator();
    const postedAt = new Date("2026-10-02T12:00:00Z");
    for (const reviewStatus of ["submitted", "approved", "rejected"] as const) await makePost(org.id, creator.id, { campaignId: campaign.id, postedAt, reviewStatus });
    expect(await workspaceHasPosts(org.id)).toBe(true);

    const base = { ...noFilters, range, mode: "created" as const, review: null, q: "", sort: "posted", order: "desc" as const, page: 1 };
    const all = await loadPostsPage(org.id, base);
    expect(all.meta.total).toBe(3);
    expect(all.data.map((p) => p.review_status).sort()).toEqual(["approved", "rejected", "submitted"]);
    expect((await loadPostsPage(org.id, { ...base, review: "rejected" })).meta.total).toBe(1);
    expect(await countListedPosts(org.id, { ...noFilters, range, mode: "created", review: null })).toBe(3);
    // A malformed sort key falls back to the documented default.
    expect((await loadPostsPage(org.id, { ...base, sort: "drop table" })).meta.sort).toBe("posted");
  });

  it("filters posts by platform, sentinel playbook and search, keeping unattributed posts out unless requested", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const playbook = await makePlaybook(org.id, campaign.id);
    const creator = await makeCreator();
    const postedAt = new Date("2026-10-03T00:00:00Z");
    await makePost(org.id, creator.id, { campaignId: campaign.id, playbookId: playbook.id, platform: "youtube", handle: "tube_star", postedAt });
    await makePost(org.id, creator.id, { campaignId: campaign.id, playbookId: null, platform: "tiktok", handle: "custom_one", postedAt });
    await makePost(org.id, creator.id, { campaignId: null, platform: "tiktok", handle: "stray", postedAt });

    const base = { ...noFilters, range, mode: "created" as const, review: null, q: "", sort: "handle", order: "asc" as const, page: 1 };
    const handles = async (patch: Partial<typeof base>) => (await loadPostsPage(org.id, { ...base, ...patch })).data.map((p) => p.handle);
    expect(await handles({})).toEqual(["custom_one", "tube_star"]);
    expect(await handles({ platform: "youtube" })).toEqual(["tube_star"]);
    expect(await handles({ playbook: "0" })).toEqual(["custom_one"]);
    expect(await handles({ campaign: "0" })).toEqual(["stray"]);
    expect(await handles({ q: "TUBE" })).toEqual(["tube_star"]);
    expect(await handles({ q: "100%_" })).toEqual([]);
  });

  it("builds a daily series for every UTC day and compares the largest groups", async () => {
    const { org } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const creator = await makeCreator();
    const tt = await makePost(org.id, creator.id, { campaignId: campaign.id, platform: "tiktok" });
    const ig = await makePost(org.id, creator.id, { campaignId: campaign.id, platform: "instagram" });
    await addDailyMetric(tt, "2026-10-02", 1_000, 200);
    await addDailyMetric(ig, "2026-10-02", 3_000, 300);
    await addDailyMetric(ig, "2026-10-05", 1_000, 0);

    const total = await loadDailyChart(org.id, { ...noFilters, range, metric: "cpm", comparison: "none" });
    expect(total.series).toHaveLength(1);
    expect(total.series[0].points).toHaveLength(7);
    // $5.00 over 4,000 views that day; $5.00 over 5,000 views for the range.
    expect(total.series[0].points[1]).toEqual({ day: "2026-10-02", value: 1.25 });
    expect(total.series[0].points[0]).toEqual({ day: "2026-10-01", value: null });
    expect(total.series[0].total).toBeCloseTo(1);

    const byPlatform = await loadDailyChart(org.id, { ...noFilters, range, metric: "views", comparison: "platform" });
    expect(byPlatform.groupCount).toBe(2);
    expect(byPlatform.series.map((s) => [s.key, s.label, s.total])).toEqual([
      ["instagram", "Instagram", 4_000],
      ["tiktok", "TikTok", 1_000],
    ]);
    expect(byPlatform.series[0].points.find((p) => p.day === "2026-10-05")?.value).toBe(1_000);

    const filtered = await loadDailyChart(org.id, { ...noFilters, platform: "tiktok", range, metric: "views", comparison: "none" });
    expect(filtered.series[0].total).toBe(1_000);
  });
});

describe("organic actions", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("lets members create a draft playbook for one of the workspace's campaigns", async () => {
    const { org } = await makeOrg();
    const member = await addMember(org.id, "member");
    const campaign = await makeCampaign(org.id, { status: "paused" });
    await signInAs(member.id);

    const result = await createPlaybookForSlug(org.slug, { campaignId: campaign.id });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.editHref).toBe(`/home/${org.slug}/playbooks/${result.data.playbookId}/edit`);
    const db = await getDb();
    const [row] = await db.select().from(playbooks).where(eq(playbooks.id, result.data.playbookId));
    expect(row).toMatchObject({ orgId: org.id, campaignId: campaign.id, status: "draft", active: false });
  });

  it("refuses a missing choice or another workspace's campaign", async () => {
    const { org, owner } = await makeOrg();
    const other = await makeOrg();
    const foreign = await makeCampaign(other.org.id);
    await signInAs(owner.id);
    expect(await createPlaybookForSlug(org.slug, { campaignId: "" })).toMatchObject({ ok: false, code: "validation" });
    expect(await createPlaybookForSlug(org.slug, { campaignId: foreign.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await createPlaybookForSlug(other.org.slug, { campaignId: foreign.id })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("returns a playbook's daily breakdown with sparse days and range totals", async () => {
    const { org } = await makeOrg();
    const member = await addMember(org.id, "member");
    const campaign = await makeCampaign(org.id);
    const playbook = await makePlaybook(org.id, campaign.id, { name: "Hook test" });
    const creator = await makeCreator();
    const post = await makePost(org.id, creator.id, { campaignId: campaign.id, playbookId: playbook.id });
    await addDailyMetric(post, "2026-10-02", 1_000, 150);
    await addDailyMetric(post, "2026-10-04", 3_000, 250);
    await signInAs(member.id);

    const result = await loadBreakdownForSlug(org.slug, { kind: "playbook", ids: [playbook.id], ...range });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.names).toEqual(["Hook test"]);
    expect(result.data.days.map((d) => d.date)).toEqual(["2026-10-02", "2026-10-04"]);
    expect(result.data.days[0]).toEqual({ date: "2026-10-02", views: 1_000, spendCents: 150, cpmUsd: 1.5, posts: 1, creators: 1 });
    expect(result.data.totals).toEqual({ views: 4_000, spendCents: 400, cpmUsd: 1, posts: 1, creators: 1 });

    const campaignBreakdown = await loadBreakdownForSlug(org.slug, { kind: "campaign", ids: [campaign.id], ...range });
    expect(campaignBreakdown.ok && campaignBreakdown.data.totals.views).toBe(4_000);
  });

  it("refuses breakdowns of other workspaces' records and invalid ranges", async () => {
    const { org, owner } = await makeOrg();
    const mine = await makeCampaign(org.id);
    const other = await makeOrg();
    const foreign = await makeCampaign(other.org.id);
    await signInAs(owner.id);
    expect(await loadBreakdownForSlug(org.slug, { kind: "campaign", ids: [mine.id, foreign.id], ...range })).toMatchObject({ ok: false, code: "not_found" });
    expect(await loadBreakdownForSlug(org.slug, { kind: "campaign", ids: [mine.id], from: "2026-10-07", to: "2026-10-01" })).toMatchObject({ ok: false, code: "validation" });
    expect(await loadBreakdownForSlug(org.slug, { kind: "campaign", ids: [mine.id], from: "2024-01-01", to: "2026-01-01" })).toMatchObject({ ok: false, code: "validation" });
    expect(await loadBreakdownForSlug(org.slug, { kind: "campaign", ids: [], ...range })).toMatchObject({ ok: false, code: "validation" });
  });
});
