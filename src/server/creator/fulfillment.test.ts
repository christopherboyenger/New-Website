import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { defaultApprovals, defaultTargeting } from "@/domain/campaign";
import { createTestDb } from "../../../tests/support/db";
import { makeCampaign, makeOrg, makePost } from "../../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../../tests/support/request-context";
import { getDb } from "../db/client";
import { adRightsGrants, campaignMemberships, campaigns, ledgerEntries, orgCreators, posts } from "../db/schema";
import { joinCampaign } from "../campaign-admission";
import { AD_RIGHTS_TERM_DAYS, listSubmissions, loadCreatorPlaybook, loadEarnings, payoutReadiness, submitPost, submissionCounts } from "./fulfillment";
import { activeCampaign, linkAccount, makeCreatorUser, publishPlaybook } from "./test-helpers";

async function admittedSetup() {
  const { org } = await makeOrg({ name: "Brand" });
  const { user, creator } = await makeCreatorUser();
  const tiktok = await linkAccount(creator.id, "tiktok", "creator_tt");
  const { campaign, playbook } = await activeCampaign(org.id, { primaryHashtag: "launchday" });
  await signInAs(user.id);
  expect(await joinCampaign({ campaignId: campaign.id })).toMatchObject({ ok: true, data: { status: "approved" } });
  const input = {
    campaignId: campaign.id,
    playbookId: playbook.id,
    socialAccountId: tiktok.id,
    url: "https://www.tiktok.com/@creator_tt/video/7300000000000000001?is_from_webapp=1#top",
    caption: "Trying this out #LaunchDay #ad",
  };
  return { org, user, creator, tiktok, campaign, playbook, input };
}

describe("creator playbook view", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("shows the published revision with a stable creator-specific variation, never the draft", async () => {
    const { creator, campaign, playbook } = await admittedSetup();
    const view = await loadCreatorPlaybook({ creator }, campaign.id, playbook.id);
    expect(view).not.toBeNull();
    expect(view!.playbook).toMatchObject({ name: "Published name", revision: 1 });
    expect(view!.variation.script).toMatchObject({ kind: "ugc", generalInstructions: "Published instructions." });
    expect(view!.variation.description).toBe("Published description");
    expect(view!.variation.hashtags).toEqual(["#summer", "#launchday"]);
    expect(JSON.stringify(view)).not.toContain("DRAFT ONLY");
    expect(JSON.stringify(view)).not.toContain("draftonly");
    expect(await loadCreatorPlaybook({ creator }, campaign.id, playbook.id)).toEqual(view);
  });

  it("is unavailable before admission, for paused campaigns and for other campaigns' playbooks", async () => {
    const { org } = await makeOrg();
    const { user, creator } = await makeCreatorUser();
    await linkAccount(creator.id, "tiktok", "not_admitted");
    const { campaign, playbook } = await activeCampaign(org.id, { approvals: { ...defaultApprovals, requireCreatorApproval: true } });
    await signInAs(user.id);
    await joinCampaign({ campaignId: campaign.id }); // requested only
    expect(await loadCreatorPlaybook({ creator }, campaign.id, playbook.id)).toBeNull();

    const db = await getDb();
    await db.update(campaignMemberships).set({ status: "approved" }).where(eq(campaignMemberships.creatorId, creator.id));
    expect(await loadCreatorPlaybook({ creator }, campaign.id, playbook.id)).not.toBeNull();
    const { playbook: foreign } = await activeCampaign(org.id);
    expect(await loadCreatorPlaybook({ creator }, campaign.id, foreign.id)).toBeNull();
    await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, campaign.id));
    expect(await loadCreatorPlaybook({ creator }, campaign.id, playbook.id)).toBeNull();
  });
});

describe("post submission", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("creates a submitted post frozen to the playbook revision with a normalized URL", async () => {
    const { org, creator, tiktok, campaign, playbook, input } = await admittedSetup();
    const result = await submitPost(input);
    expect(result).toMatchObject({ ok: true, data: { adRightsGranted: false } });
    const db = await getDb();
    const [row] = await db.select().from(posts).where(eq(posts.creatorId, creator.id));
    expect(row).toMatchObject({
      orgId: org.id,
      campaignId: campaign.id,
      playbookId: playbook.id,
      playbookRevision: 1,
      socialAccountId: tiktok.id,
      platform: "tiktok",
      handle: "creator_tt",
      url: "https://www.tiktok.com/@creator_tt/video/7300000000000000001",
      reviewStatus: "submitted",
    });
    expect(await db.select().from(adRightsGrants)).toEqual([]);
  });

  it("writes a paid-ad rights grant only when the creator opts in", async () => {
    const { org, creator, input } = await admittedSetup();
    const before = Date.now();
    const result = await submitPost({ ...input, grantAdRights: true });
    expect(result).toMatchObject({ ok: true, data: { adRightsGranted: true } });
    const db = await getDb();
    const [grant] = await db.select().from(adRightsGrants);
    expect(grant).toMatchObject({ orgId: org.id, creatorId: creator.id, providers: ["tiktok_ads"], evidenceKind: "creator_portal_consent", revokedAt: null });
    expect(grant.postId).toBe(result.ok ? result.data.postId : "");
    const days = (grant.expiresAt!.getTime() - before) / 86_400_000;
    expect(Math.round(days)).toBe(AD_RIGHTS_TERM_DAYS);
  });

  it("refuses rights for platforms without a supported ad placement", async () => {
    const { creator, input } = await admittedSetup();
    const yt = await linkAccount(creator.id, "youtube", "creator_yt");
    const result = await submitPost({ ...input, socialAccountId: yt.id, url: "https://youtu.be/abc123", grantAdRights: true });
    expect(result).toMatchObject({ ok: false, fieldErrors: { grantAdRights: expect.any(String) } });
  });

  it("requires an approved admission and an active campaign", async () => {
    const { org } = await makeOrg();
    const { user, creator } = await makeCreatorUser();
    const account = await linkAccount(creator.id, "tiktok", "outsider");
    const { campaign, playbook } = await activeCampaign(org.id, { primaryHashtag: "outsidertag" });
    await signInAs(user.id);
    const input = { campaignId: campaign.id, playbookId: playbook.id, socialAccountId: account.id, url: "https://www.tiktok.com/@outsider/video/1", caption: "#outsidertag" };
    expect(await submitPost(input)).toMatchObject({ ok: false, code: "forbidden" });

    const db = await getDb();
    await db.insert(campaignMemberships).values({ campaignId: campaign.id, creatorId: creator.id, orgId: org.id, status: "approved" });
    await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, campaign.id));
    expect(await submitPost(input)).toMatchObject({ ok: false, code: "conflict" });
    await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaign.id));
    await db.insert(orgCreators).values({ orgId: org.id, creatorId: creator.id, removedAt: new Date() }).onConflictDoUpdate({ target: [orgCreators.orgId, orgCreators.creatorId], set: { removedAt: new Date() } });
    expect(await submitPost(input)).toMatchObject({ ok: false, code: "forbidden" });
    expect(await db.select().from(posts)).toEqual([]);
  });

  it("rejects another creator's social account and accounts off the campaign's platforms", async () => {
    const { input, creator } = await admittedSetup();
    const { creator: someoneElse } = await makeCreatorUser();
    const theirs = await linkAccount(someoneElse.id, "tiktok", "someone_else");
    expect(await submitPost({ ...input, socialAccountId: theirs.id })).toMatchObject({ ok: false, fieldErrors: { socialAccountId: expect.any(String) } });

    const db = await getDb();
    await db.update(campaigns).set({ targeting: { ...defaultTargeting, platforms: ["tiktok"] } }).where(eq(campaigns.id, input.campaignId));
    const ig = await linkAccount(creator.id, "instagram", "creator_ig");
    expect(await submitPost({ ...input, socialAccountId: ig.id, url: "https://www.instagram.com/reel/abc/" })).toMatchObject({
      ok: false,
      fieldErrors: { socialAccountId: expect.stringContaining("Instagram") },
    });
  });

  it("validates the URL host and scheme, and the campaign hashtag in the caption", async () => {
    const { input } = await admittedSetup();
    expect(await submitPost({ ...input, url: "https://www.instagram.com/reel/abc" })).toMatchObject({ ok: false, fieldErrors: { url: "That isn't a TikTok link." } });
    expect(await submitPost({ ...input, url: "http://www.tiktok.com/@x/video/1" })).toMatchObject({ ok: false, fieldErrors: { url: expect.stringContaining("https") } });
    expect(await submitPost({ ...input, url: "https://tiktok.com.evil.test/@x/video/1" })).toMatchObject({ ok: false, fieldErrors: { url: "That isn't a TikTok link." } });
    expect(await submitPost({ ...input, caption: "No tag here #launchdayy" })).toMatchObject({ ok: false, fieldErrors: { caption: expect.stringContaining("#launchday") } });
  });

  it("rejects duplicate submissions of the same post, including across creators", async () => {
    const { input, campaign, org } = await admittedSetup();
    expect(await submitPost(input)).toMatchObject({ ok: true });
    expect(await submitPost({ ...input, url: "https://tiktok.com/@creator_tt/video/7300000000000000001/" })).toMatchObject({ ok: false, code: "conflict", fieldErrors: { url: expect.any(String) } });

    const { user, creator } = await makeCreatorUser();
    const account = await linkAccount(creator.id, "tiktok", "copycat");
    const db = await getDb();
    await db.insert(campaignMemberships).values({ campaignId: campaign.id, creatorId: creator.id, orgId: org.id, status: "approved" });
    await signInAs(user.id);
    expect(await submitPost({ ...input, socialAccountId: account.id })).toMatchObject({ ok: false, code: "conflict" });
  });

  it("rejects a playbook that is not distributed in the campaign", async () => {
    const { input, org } = await admittedSetup();
    const other = await makeCampaign(org.id, { status: "active" });
    const otherPlaybook = await publishPlaybook(org.id, other.id);
    expect(await submitPost({ ...input, playbookId: otherPlaybook.id })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("submission history and earnings", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("lists only the signed-in creator's submissions with review status and reasons", async () => {
    const { org, creator, input } = await admittedSetup();
    await submitPost({ ...input, grantAdRights: true });
    const { creator: other } = await makeCreatorUser();
    await makePost(org.id, other.id, { url: "https://www.tiktok.com/@other/video/9" });
    await makePost(org.id, creator.id, { url: "https://www.tiktok.com/@creator_tt/video/2", reviewStatus: "rejected", reviewReason: "Missing the hook scene." });

    const history = await listSubmissions({ creator });
    expect(history.total).toBe(2);
    expect(history.rows.map((r) => r.url).sort()).toEqual(["https://www.tiktok.com/@creator_tt/video/2", "https://www.tiktok.com/@creator_tt/video/7300000000000000001"]);
    expect(history.rows.find((r) => r.reviewStatus === "rejected")).toMatchObject({ reviewReason: "Missing the hook scene." });
    expect(history.rows.find((r) => r.reviewStatus === "submitted")).toMatchObject({ brandName: "Brand", playbookRevision: 1, adRights: { revoked: false } });
    expect((await listSubmissions({ creator: other })).rows.map((r) => r.url)).toEqual(["https://www.tiktok.com/@other/video/9"]);
    expect(await submissionCounts({ creator })).toEqual({ submitted: 1, approved: 0, rejected: 1 });
  });

  it("reads only this creator's obligation entries; none is a confirmed zero", async () => {
    const { org, creator } = await admittedSetup();
    expect(await loadEarnings({ creator })).toEqual({ balanceCents: 0, entryCount: 0, recent: [] });
    const post = await makePost(org.id, creator.id, { url: "https://www.tiktok.com/@creator_tt/video/3" });
    const { creator: other } = await makeCreatorUser();
    const db = await getDb();
    const entry = (account: "creator_obligation" | "campaign_spend", refType: string, refId: string, amountCents: number) => ({
      id: newId("led"),
      orgId: org.id,
      account,
      amountCents,
      occurredAt: new Date(),
      effectKey: newId("led"),
      description: "Test entry",
      refType,
      refId,
    });
    await db.insert(ledgerEntries).values([
      entry("creator_obligation", "post", post.id, 1234),
      entry("creator_obligation", "creator", creator.id, 66),
      entry("creator_obligation", "creator", other.id, 9999),
      entry("campaign_spend", "post", post.id, 5000),
    ]);
    const earnings = await loadEarnings({ creator });
    expect(earnings).toMatchObject({ balanceCents: 1300, entryCount: 2 });
    expect(earnings.recent[0]).toMatchObject({ brandName: "Brand" });
  });

  it("reports payouts as not configured", () => {
    expect(payoutReadiness()).toMatchObject({ key: "creator_payouts", configured: false });
  });
});
