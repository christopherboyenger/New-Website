import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { createTestDb } from "../../tests/support/db";
import { addDailyMetric, addMember, makeCampaign, makeCreator, makeOrg, makePost } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { requireOrgAction } from "./authz";
import { getDb } from "./db/client";
import { auditLog, campaignMemberships, orgCreators, socialAccounts } from "./db/schema";
import {
  defaultRosterQuery,
  isCreatorRemovedFromOrg,
  listRoster,
  loadCreatorDetail,
  parseRosterQuery,
  removeCreators,
  restoreCreators,
  rosterCounts,
  rosterQueryString,
  rosterSummary,
  type RosterQuery,
} from "./creators-roster";

const NOW = new Date("2026-10-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

async function roster(orgId: string, creatorId: string, removedAt: Date | null = null) {
  const db = await getDb();
  await db.insert(orgCreators).values({ orgId, creatorId, removedAt });
}

async function account(creatorId: string, platform: "tiktok" | "instagram" | "youtube", handle: string, verification: "verified" | "unverified" = "verified") {
  const db = await getDb();
  await db.insert(socialAccounts).values({ id: newId("acc"), creatorId, platform, handle, verification, verifiedAt: verification === "verified" ? NOW : null });
}

async function ctxFor(userId: string, slug: string) {
  await signInAs(userId);
  return requireOrgAction(slug);
}

const query = (patch: Partial<RosterQuery> = {}): RosterQuery => ({ ...defaultRosterQuery, ...patch });

describe("creators roster", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("lists only the authorized org's creators and keeps other orgs' creators out of detail and commands", async () => {
    const { org, owner } = await makeOrg();
    const { org: other, owner: otherOwner } = await makeOrg();
    const mine = await makeCreator({ displayName: "Mine" });
    const theirs = await makeCreator({ displayName: "Theirs" });
    await roster(org.id, mine.id);
    await roster(other.id, theirs.id);
    // A post by "theirs" in the other org must not leak into this org's metrics.
    await makePost(other.id, theirs.id, { views: 500 });

    const ctx = await ctxFor(owner.id, org.slug);
    const table = await listRoster(ctx, query(), NOW);
    expect(table.rows.map((r) => r.name)).toEqual(["Mine"]);
    expect(await loadCreatorDetail(ctx, theirs.id)).toBeNull();
    expect(await removeCreators(org.slug, { creatorIds: [theirs.id] })).toMatchObject({ ok: false, code: "not_found" });

    const otherCtx = await ctxFor(otherOwner.id, other.slug);
    expect((await listRoster(otherCtx, query(), NOW)).rows.map((r) => r.name)).toEqual(["Theirs"]);
    expect(await removeCreators(org.slug, { creatorIds: [mine.id] })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("includes creators linked by an approved post or approved admission without a roster row", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const poster = await makeCreator({ displayName: "Poster" });
    const admitted = await makeCreator({ displayName: "Admitted" });
    const requested = await makeCreator({ displayName: "Requested only" });
    const rejectedPost = await makeCreator({ displayName: "Rejected post only" });
    await makePost(org.id, poster.id, { campaignId: campaign.id });
    await makePost(org.id, rejectedPost.id, { reviewStatus: "rejected" });
    const db = await getDb();
    await db.insert(campaignMemberships).values([
      { campaignId: campaign.id, creatorId: admitted.id, orgId: org.id, status: "approved" },
      { campaignId: campaign.id, creatorId: requested.id, orgId: org.id, status: "requested" },
    ]);

    const ctx = await ctxFor(owner.id, org.slug);
    const names = (await listRoster(ctx, query({ sort: "creator", order: "asc" }), NOW)).rows.map((r) => r.name);
    expect(names).toEqual(["Admitted", "Poster"]);
    expect(await rosterCounts(ctx)).toEqual({ all: 2, removed: 0 });
  });

  it("aggregates lifetime counters of approved posts, accounts, platforms and posting activity", async () => {
    const { org, owner } = await makeOrg();
    const a = await makeCreator({ displayName: "Ada", level: "gold" });
    const b = await makeCreator({ displayName: "Bo", level: "silver" });
    await roster(org.id, a.id);
    await roster(org.id, b.id);
    await account(a.id, "tiktok", "ada_t");
    await account(a.id, "instagram", "ada_i");
    await account(a.id, "instagram", "ada_i2");
    await makePost(org.id, a.id, { views: 1000, likes: 50, comments: 5, postedAt: daysAgo(1) });
    await makePost(org.id, a.id, { views: 3000, likes: 10, comments: null, postedAt: daysAgo(1) });
    await makePost(org.id, a.id, { views: 99_999, reviewStatus: "rejected", postedAt: daysAgo(2) });
    await makePost(org.id, a.id, { views: 10, postedAt: daysAgo(70) });
    // Bo's only post has never been observed: metrics are unavailable, not zero.
    await makePost(org.id, b.id, { views: null, likes: null, comments: null, postedAt: daysAgo(3) });

    const ctx = await ctxFor(owner.id, org.slug);
    const table = await listRoster(ctx, query(), NOW);
    expect(table.rows.map((r) => r.name)).toEqual(["Ada", "Bo"]);
    const [ada, bo] = table.rows;
    expect(ada).toMatchObject({ level: "gold", posts: 3, views: 4010, likes: 60, comments: 5, accounts: 3, platforms: ["tiktok", "instagram"] });
    expect(ada.activity).toEqual({ "2026-10-14": 2 });
    expect(bo).toMatchObject({ posts: 1, views: null, likes: null, comments: null, accounts: 0, platforms: [] });
    expect(table.activityEnd).toBe("2026-10-15");

    const byLevelAsc = await listRoster(ctx, query({ sort: "level", order: "asc" }), NOW);
    expect(byLevelAsc.rows.map((r) => r.name)).toEqual(["Bo", "Ada"]);
  });

  it("filters by search (name or handle), level, platform and campaign", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const a = await makeCreator({ displayName: "Ada Lovelace", level: "gold" });
    const b = await makeCreator({ displayName: "Bo", level: "bronze" });
    await roster(org.id, a.id);
    await roster(org.id, b.id);
    await account(b.id, "youtube", "bo_100%");
    await makePost(org.id, a.id, { campaignId: campaign.id });

    const ctx = await ctxFor(owner.id, org.slug);
    const names = async (patch: Partial<RosterQuery>) => (await listRoster(ctx, query(patch), NOW)).rows.map((r) => r.name);
    expect(await names({ q: "love" })).toEqual(["Ada Lovelace"]);
    expect(await names({ q: "@bo_100%" })).toEqual(["Bo"]);
    expect(await names({ q: "%" })).toEqual(["Bo"]);
    expect(await names({ level: "gold" })).toEqual(["Ada Lovelace"]);
    expect(await names({ platform: "youtube" })).toEqual(["Bo"]);
    expect(await names({ campaign: campaign.id })).toEqual(["Ada Lovelace"]);
  });

  it("removes and restores creators (owners only), with the Removed tab and audit", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org.id, "member");
    const a = await makeCreator({ displayName: "Ada" });
    const viaPost = await makeCreator({ displayName: "Via post" });
    await roster(org.id, a.id);
    await makePost(org.id, viaPost.id);

    await signInAs(member.id);
    expect(await removeCreators(org.slug, { creatorIds: [a.id] })).toMatchObject({ ok: false, code: "forbidden" });

    await signInAs(owner.id);
    expect(await removeCreators(org.slug, { creatorIds: [] })).toMatchObject({ ok: false, code: "validation" });
    expect(await removeCreators(org.slug, { creatorIds: [a.id, viaPost.id] })).toMatchObject({ ok: true, data: { count: 2 } });
    expect(await isCreatorRemovedFromOrg(org.id, viaPost.id)).toBe(true);

    const ctx = await ctxFor(owner.id, org.slug);
    expect(await rosterCounts(ctx)).toEqual({ all: 0, removed: 2 });
    expect((await listRoster(ctx, query({ tab: "removed" }), NOW)).rows.every((r) => r.removed)).toBe(true);
    expect((await listRoster(ctx, query(), NOW)).rows).toHaveLength(0);

    expect(await restoreCreators(org.slug, { creatorIds: [a.id] })).toMatchObject({ ok: true, data: { count: 1 } });
    expect(await restoreCreators(org.slug, { creatorIds: [a.id] })).toMatchObject({ ok: false, code: "conflict" });
    expect(await rosterCounts(ctx)).toEqual({ all: 1, removed: 1 });

    const db = await getDb();
    const [row] = await db.select().from(orgCreators).where(and(eq(orgCreators.orgId, org.id), eq(orgCreators.creatorId, a.id)));
    expect(row).toMatchObject({ removedAt: null, removedByUserId: null });
    const actions = (await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.orgId, org.id))).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["creator.remove", "creator.restore"]));
  });

  it("computes summary leaders from the defined window and reports empty as null", async () => {
    const { org, owner } = await makeOrg();
    const ctx = await ctxFor(owner.id, org.slug);
    expect(await rosterSummary(ctx, NOW)).toMatchObject({ mostViews: null, mostViral: null, mostEngaging: null });

    const a = await makeCreator({ displayName: "Ada" });
    const b = await makeCreator({ displayName: "Bo" });
    const gone = await makeCreator({ displayName: "Removed" });
    await roster(org.id, a.id);
    await roster(org.id, b.id);
    await roster(org.id, gone.id, NOW);
    const pa = await makePost(org.id, a.id, { views: 5000, likes: 50, comments: 0, postedAt: daysAgo(2) });
    const pb = await makePost(org.id, b.id, { views: 2000, likes: 300, comments: 20, postedAt: daysAgo(3) });
    await makePost(org.id, b.id, { views: 900_000, likes: 1, comments: 1, postedAt: daysAgo(45) });
    const pg = await makePost(org.id, gone.id, { views: 1_000_000, likes: 900_000, comments: 0, postedAt: daysAgo(1) });
    await addDailyMetric(pa, "2026-10-14", 100);
    await addDailyMetric(pb, "2026-10-14", 700);
    await addDailyMetric(pb, "2026-08-01", 99_999);
    await addDailyMetric(pg, "2026-10-14", 99_999);

    const summary = await rosterSummary(ctx, NOW);
    expect(summary.mostViews).toEqual({ creatorId: b.id, name: "Bo", value: 700 });
    expect(summary.mostViral).toEqual({ creatorId: a.id, name: "Ada", value: 5000 });
    expect(summary.mostEngaging?.creatorId).toBe(b.id);
    expect(summary.mostEngaging?.value).toBeCloseTo(16, 5);
  });

  it("loads creator detail with accounts, admissions and recent posts", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id, { name: "Spring" });
    const a = await makeCreator({ displayName: "Ada", country: "US" });
    await roster(org.id, a.id);
    await account(a.id, "tiktok", "ada", "unverified");
    const db = await getDb();
    await db.insert(campaignMemberships).values({ campaignId: campaign.id, creatorId: a.id, orgId: org.id, status: "approved" });
    await makePost(org.id, a.id, { reviewStatus: "submitted", views: null });

    const ctx = await ctxFor(owner.id, org.slug);
    const detail = await loadCreatorDetail(ctx, a.id);
    expect(detail).toMatchObject({
      name: "Ada",
      country: "US",
      removed: false,
      accounts: [{ platform: "tiktok", handle: "ada", verification: "unverified", verifiedAt: null }],
      campaigns: [{ name: "Spring" }],
      recentPosts: [{ reviewStatus: "submitted", views: null }],
    });
  });

  it("parses and serializes URL state canonically", () => {
    const parsed = parseRosterQuery({ tab: "removed", search: " ada ", level: "gold", platform: "nope", sort: "creator", page: "3" });
    expect(parsed).toMatchObject({ tab: "removed", q: "ada", level: "gold", platform: null, sort: "creator", order: "asc", page: 3 });
    expect(rosterQueryString(parsed, { page: 1 })).toBe("?tab=removed&q=ada&level=gold&sort=creator&order=asc");
    expect(rosterQueryString(parseRosterQuery({}))).toBe("");
  });
});
