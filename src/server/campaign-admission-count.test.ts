import { beforeEach, describe, expect, it } from "vitest";
import { defaultApprovals } from "@/domain/campaign";
import { createTestDb } from "../../tests/support/db";
import { makeOrg } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { requireOrgAction } from "./authz";
import { countJoinRequests, decideJoinRequest, joinCampaign } from "./campaign-admission";
import { activeCampaign, linkAccount, makeCreatorUser } from "./creator/test-helpers";

/**
 * The pending count drives the "Join requests" entry point in the Creators
 * page header (the queue at /home/<org>/creators/requests had no link).
 */
describe("countJoinRequests", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("counts only this org's pending requests and drops once decided", async () => {
    const { org, owner } = await makeOrg({ planId: "unlimited" });
    const { org: other, owner: otherOwner } = await makeOrg({ planId: "unlimited" });
    const { user, creator } = await makeCreatorUser({ displayName: "Requester" });
    await linkAccount(creator.id, "tiktok", "requester");
    const { campaign } = await activeCampaign(org.id, { approvals: { ...defaultApprovals, requireCreatorApproval: true }, name: "Gated" });

    await signInAs(owner.id);
    expect(await countJoinRequests(await requireOrgAction(org.slug, "creator:manage"))).toBe(0);

    await signInAs(user.id);
    await joinCampaign({ campaignId: campaign.id });

    await signInAs(owner.id);
    expect(await countJoinRequests(await requireOrgAction(org.slug, "creator:manage"))).toBe(1);

    await signInAs(otherOwner.id);
    expect(await countJoinRequests(await requireOrgAction(other.slug, "creator:manage"))).toBe(0);

    await signInAs(owner.id);
    expect(await decideJoinRequest(org.slug, { campaignId: campaign.id, creatorId: creator.id }, "reject")).toMatchObject({ ok: true });
    expect(await countJoinRequests(await requireOrgAction(org.slug, "creator:manage"))).toBe(0);
  });
});
