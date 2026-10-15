import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { defaultApprovals, defaultTargeting } from "@/domain/campaign";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeCampaign, makeOrg, makePlaybook } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { requireOrgAction } from "./authz";
import { getDb } from "./db/client";
import { auditLog, campaignMemberships, orgCreators } from "./db/schema";
import {
  decideJoinRequest,
  discoverCampaigns,
  evaluateEligibility,
  joinCampaign,
  listJoinRequests,
  loadCreatorCampaign,
} from "./campaign-admission";
import { activeCampaign, linkAccount, makeCreatorUser, publishPlaybook } from "./creator/test-helpers";

const approvalRequired = { ...defaultApprovals, requireCreatorApproval: true };

async function membership(campaignId: string, creatorId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(campaignMemberships)
    .where(and(eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.creatorId, creatorId)));
  return row ?? null;
}

describe("evaluateEligibility", () => {
  const creator = { level: "gold" as const, country: "US" };
  const tiktok = { platform: "tiktok" as const, verification: "unverified" as const, dedicated: false };

  it("accepts an untargeted campaign for a creator with any account", () => {
    expect(evaluateEligibility({ targeting: defaultTargeting, approvals: defaultApprovals }, creator, [tiktok])).toEqual({ eligible: true, reasons: [], platforms: ["tiktok"] });
  });

  it("applies country, platform, level, dedicated and demographic rules", () => {
    const campaign = (t: Partial<typeof defaultTargeting>, a: Partial<typeof defaultApprovals> = {}) => ({ targeting: { ...defaultTargeting, ...t }, approvals: { ...defaultApprovals, ...a } });
    expect(evaluateEligibility(campaign({ countries: ["GB"] }), creator, [tiktok]).reasons).toEqual(["country"]);
    expect(evaluateEligibility(campaign({ countries: ["US"] }), { ...creator, country: null }, [tiktok]).reasons).toEqual(["country"]);
    expect(evaluateEligibility(campaign({ platforms: ["youtube"] }), creator, [tiktok]).reasons).toEqual(["platform"]);
    expect(evaluateEligibility(campaign({}), creator, []).reasons).toEqual(["platform"]);
    expect(evaluateEligibility(campaign({ minCreatorLevel: "platinum" }), creator, [tiktok]).reasons).toEqual(["level"]);
    expect(evaluateEligibility(campaign({ minCreatorLevel: "gold" }), creator, [tiktok]).eligible).toBe(true);
    expect(evaluateEligibility(campaign({}, { requireDedicatedAccount: true }), creator, [{ ...tiktok, dedicated: true }]).reasons).toEqual(["dedicated"]);
    expect(evaluateEligibility(campaign({}, { requireDedicatedAccount: true }), creator, [{ ...tiktok, dedicated: true, verification: "verified" }]).eligible).toBe(true);
    expect(evaluateEligibility(campaign({ gender: "female" }), creator, [tiktok]).reasons).toEqual(["demographics"]);
  });
});

describe("campaign discovery and joining", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("offers only active campaigns with a published, active playbook that match the creator", async () => {
    const { org } = await makeOrg({ name: "Brand One" });
    const { user, creator } = await makeCreatorUser({ level: "silver", country: "US" });
    await linkAccount(creator.id, "tiktok", "me_on_tiktok");

    const { campaign: open } = await activeCampaign(org.id, { name: "Open" });
    await activeCampaign(org.id, { name: "Wrong country", targeting: { ...defaultTargeting, countries: ["DE"] } });
    await activeCampaign(org.id, { name: "Wrong platform", targeting: { ...defaultTargeting, platforms: ["youtube"] } });
    await activeCampaign(org.id, { name: "Too senior", targeting: { ...defaultTargeting, minCreatorLevel: "gold" } });
    const paused = await makeCampaign(org.id, { name: "Paused", status: "paused" });
    await publishPlaybook(org.id, paused.id);
    const inactive = await makeCampaign(org.id, { name: "Inactive", status: "inactive" });
    await publishPlaybook(org.id, inactive.id);
    await makeCampaign(org.id, { name: "No playbook", status: "active" });
    const unpublished = await makeCampaign(org.id, { name: "Unpublished", status: "active" });
    await makePlaybook(org.id, unpublished.id, { status: "draft" });
    const switchedOff = await makeCampaign(org.id, { name: "Switched off", status: "active" });
    await publishPlaybook(org.id, switchedOff.id, { active: false });

    await signInAs(user.id);
    const discovery = await discoverCampaigns({ creator });
    expect(discovery.available.map((c) => c.name)).toEqual(["Open"]);
    expect(discovery.available[0]).toMatchObject({ id: open.id, brandName: "Brand One", playbookCount: 1, admission: null });
    expect(discovery.mine).toEqual([]);
  });

  it("hides every campaign of an org that removed the creator and refuses to join them", async () => {
    const { org } = await makeOrg();
    const { user, creator } = await makeCreatorUser();
    await linkAccount(creator.id, "tiktok", "removed_one");
    const { campaign } = await activeCampaign(org.id);
    const db = await getDb();
    await db.insert(orgCreators).values({ orgId: org.id, creatorId: creator.id, removedAt: new Date() });

    await signInAs(user.id);
    expect((await discoverCampaigns({ creator })).available).toEqual([]);
    expect(await loadCreatorCampaign({ creator }, campaign.id)).toBeNull();
    expect(await joinCampaign({ campaignId: campaign.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await membership(campaign.id, creator.id)).toBeNull();
  });

  it("joins as approved when the campaign doesn't require approval, and adds the creator to the org roster", async () => {
    const { org } = await makeOrg();
    const { user, creator } = await makeCreatorUser();
    await linkAccount(creator.id, "instagram", "joiner");
    const { campaign } = await activeCampaign(org.id);

    await signInAs(user.id);
    expect(await joinCampaign({ campaignId: campaign.id })).toMatchObject({ ok: true, data: { status: "approved" } });
    expect(await membership(campaign.id, creator.id)).toMatchObject({ status: "approved", orgId: org.id });
    const db = await getDb();
    expect(await db.select().from(orgCreators).where(eq(orgCreators.creatorId, creator.id))).toHaveLength(1);
    // Joining again is idempotent.
    expect(await joinCampaign({ campaignId: campaign.id })).toMatchObject({ ok: true, data: { status: "approved" } });
    const discovery = await discoverCampaigns({ creator });
    expect(discovery.mine.map((c) => c.admission)).toEqual(["approved"]);
    expect(discovery.available).toEqual([]);
  });

  it("creates a request when the campaign requires creator approval", async () => {
    const { org } = await makeOrg({ planId: "unlimited" });
    const { user, creator } = await makeCreatorUser();
    await linkAccount(creator.id, "tiktok", "asker");
    const { campaign } = await activeCampaign(org.id, { approvals: approvalRequired });

    await signInAs(user.id);
    expect(await joinCampaign({ campaignId: campaign.id })).toMatchObject({ ok: true, data: { status: "requested" } });
    expect(await membership(campaign.id, creator.id)).toMatchObject({ status: "requested", decidedAt: null });
  });

  it("refuses ineligible creators, inactive campaigns and full campaigns", async () => {
    const { org } = await makeOrg();
    const { user, creator } = await makeCreatorUser();
    await signInAs(user.id);
    const { campaign } = await activeCampaign(org.id);
    // No linked account: the campaign is not offered.
    expect(await joinCampaign({ campaignId: campaign.id })).toMatchObject({ ok: false, code: "not_found" });

    await linkAccount(creator.id, "tiktok", "full_check");
    const paused = await makeCampaign(org.id, { status: "paused" });
    await publishPlaybook(org.id, paused.id);
    expect(await joinCampaign({ campaignId: paused.id })).toMatchObject({ ok: false, code: "not_found" });

    const { campaign: capped } = await activeCampaign(org.id, { maxCreators: 1 });
    const { creator: other } = await makeCreatorUser();
    const db = await getDb();
    await db.insert(campaignMemberships).values({ campaignId: capped.id, creatorId: other.id, orgId: org.id, status: "approved" });
    expect(await joinCampaign({ campaignId: capped.id })).toMatchObject({ ok: false, code: "conflict" });
  });

  it("requires a creator profile and a session", async () => {
    const { org } = await makeOrg();
    const { campaign } = await activeCampaign(org.id);
    expect(await joinCampaign({ campaignId: campaign.id })).toMatchObject({ ok: false, code: "forbidden" });
    const { owner } = await makeOrg();
    await signInAs(owner.id);
    expect(await joinCampaign({ campaignId: campaign.id })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("join request queue", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  async function pendingRequest() {
    const { org, owner } = await makeOrg({ planId: "unlimited" });
    const { user, creator } = await makeCreatorUser({ displayName: "Requester" });
    await linkAccount(creator.id, "tiktok", "requester");
    const { campaign } = await activeCampaign(org.id, { approvals: approvalRequired, name: "Gated" });
    await signInAs(user.id);
    await joinCampaign({ campaignId: campaign.id });
    return { org, owner, creator, campaign };
  }

  it("lets an owner list and approve requests, with an audit entry", async () => {
    const { org, owner, creator, campaign } = await pendingRequest();
    await signInAs(owner.id);
    const ctx = await requireOrgAction(org.slug, "creator:manage");
    const page = await listJoinRequests(ctx);
    expect(page.total).toBe(1);
    expect(page.rows[0]).toMatchObject({ campaignName: "Gated", creatorName: "Requester", removed: false });
    expect(page.rows[0].accounts).toEqual([{ platform: "tiktok", handle: "requester", verification: "unverified", dedicated: false }]);

    expect(await decideJoinRequest(org.slug, { campaignId: campaign.id, creatorId: creator.id }, "approve")).toMatchObject({ ok: true });
    expect(await membership(campaign.id, creator.id)).toMatchObject({ status: "approved", decidedByUserId: owner.id });
    const db = await getDb();
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.orgId, org.id), eq(auditLog.action, "campaign_membership.approve")));
    expect(audits).toHaveLength(1);
    // Already decided.
    expect(await decideJoinRequest(org.slug, { campaignId: campaign.id, creatorId: creator.id }, "reject")).toMatchObject({ ok: false, code: "conflict" });
  });

  it("rejects requests", async () => {
    const { org, owner, creator, campaign } = await pendingRequest();
    await signInAs(owner.id);
    expect(await decideJoinRequest(org.slug, { campaignId: campaign.id, creatorId: creator.id }, "reject")).toMatchObject({ ok: true });
    expect(await membership(campaign.id, creator.id)).toMatchObject({ status: "rejected" });
  });

  it("forbids members and hides requests from other orgs", async () => {
    const { org, creator, campaign } = await pendingRequest();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    expect(await decideJoinRequest(org.slug, { campaignId: campaign.id, creatorId: creator.id }, "approve")).toMatchObject({ ok: false, code: "forbidden" });

    const { org: other, owner: otherOwner } = await makeOrg({ planId: "unlimited" });
    await signInAs(otherOwner.id);
    // Another org's owner: their own slug doesn't reach this request, and this org's slug is not theirs.
    expect(await decideJoinRequest(other.slug, { campaignId: campaign.id, creatorId: creator.id }, "approve")).toMatchObject({ ok: false, code: "not_found" });
    expect(await decideJoinRequest(org.slug, { campaignId: campaign.id, creatorId: creator.id }, "approve")).toMatchObject({ ok: false, code: "not_found" });
    expect((await listJoinRequests(await requireOrgAction(other.slug, "creator:manage"))).total).toBe(0);
    expect(await membership(campaign.id, creator.id)).toMatchObject({ status: "requested" });
  });

  it("refuses to approve a creator the org removed", async () => {
    const { org, owner, creator, campaign } = await pendingRequest();
    const db = await getDb();
    await db.update(orgCreators).set({ removedAt: new Date() }).where(and(eq(orgCreators.orgId, org.id), eq(orgCreators.creatorId, creator.id)));
    await signInAs(owner.id);
    const ctx = await requireOrgAction(org.slug, "creator:manage");
    expect((await listJoinRequests(ctx)).rows[0].removed).toBe(true);
    expect(await decideJoinRequest(org.slug, { campaignId: campaign.id, creatorId: creator.id }, "approve")).toMatchObject({ ok: false, code: "conflict" });
    expect(await membership(campaign.id, creator.id)).toMatchObject({ status: "requested" });
  });
});
