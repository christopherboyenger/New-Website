import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./db/client";
import { campaignMemberships, orgCreators, socialAccounts } from "./db/schema";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeCampaign, makeCreator, makeOrg, makePlaybook, makePost, makeUser } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { searchWorkspaceAction, type SearchResults } from "./search";

function titles(results: SearchResults, kind: string): string[] {
  return results.groups.find((g) => g.kind === kind)?.items.map((i) => i.title) ?? [];
}

async function search(slug: string, query: string): Promise<SearchResults> {
  const res = await searchWorkspaceAction(slug, query);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

describe("global search", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("only returns the caller's organization's campaigns, playbooks, posts and creators", async () => {
    const { org: mine, owner } = await makeOrg({ slug: "mine" });
    const { org: theirs } = await makeOrg({ slug: "theirs" });
    const myCampaign = await makeCampaign(mine.id, { name: "Summer launch", primaryHashtag: "summerlaunch" });
    const theirCampaign = await makeCampaign(theirs.id, { name: "Summer sale", primaryHashtag: "summersale" });
    await makePlaybook(mine.id, myCampaign.id, { name: "Summer greenscreen" });
    await makePlaybook(theirs.id, theirCampaign.id, { name: "Summer slideshow" });
    const myCreator = await makeCreator({ displayName: "Summer Rivera" });
    const theirCreator = await makeCreator({ displayName: "Summer Okafor" });
    await makePost(mine.id, myCreator.id, { campaignId: myCampaign.id, handle: "summer_rivera", caption: "Summer haul" });
    await makePost(theirs.id, theirCreator.id, { campaignId: theirCampaign.id, handle: "summer_okafor", caption: "Summer picks" });

    await signInAs(owner.id);
    const results = await search(mine.slug, "summer");
    expect(titles(results, "campaign")).toEqual(["Summer launch"]);
    expect(titles(results, "playbook")).toEqual(["Summer greenscreen"]);
    expect(titles(results, "post")).toEqual(["@summer_rivera"]);
    expect(titles(results, "creator")).toEqual(["Summer Rivera"]);
    for (const item of results.groups.flatMap((g) => g.items)) expect(item.href.startsWith("/home/mine")).toBe(true);
    expect(results.groups.find((g) => g.kind === "campaign")?.items[0].href).toBe(`/home/mine/campaigns?tab=playbooks&campaign=${myCampaign.id}`);
  });

  it("treats another organization's slug as not found", async () => {
    const { owner } = await makeOrg({ slug: "mine" });
    await makeOrg({ slug: "theirs" });
    await signInAs(owner.id);
    expect(await searchWorkspaceAction("theirs", "summer")).toMatchObject({ ok: false, code: "not_found" });
    expect(await searchWorkspaceAction("does-not-exist", "summer")).toMatchObject({ ok: false, code: "not_found" });
    resetRequestContext();
    expect(await searchWorkspaceAction("mine", "")).toMatchObject({ ok: false, code: "not_found" });
  });

  it("filters workspace pages by the caller's permissions", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org.id, "member");

    await signInAs(owner.id);
    const ownerPages = titles(await search(org.slug, ""), "page");
    expect(ownerPages).toEqual(expect.arrayContaining(["Home", "Live", "Organic", "Billing", "New campaign", "Create ads"]));
    expect(titles(await search(org.slug, "billing"), "page")).toEqual(["Billing"]);

    await signInAs(member.id);
    const memberPages = titles(await search(org.slug, ""), "page");
    expect(memberPages).toEqual(expect.arrayContaining(["Home", "Live", "Organic", "Members"]));
    expect(memberPages).not.toContain("Billing");
    expect(memberPages).not.toContain("New campaign");
    expect(memberPages).not.toContain("Create ads");
    expect((await search(org.slug, "billing")).groups).toEqual([]);
  });

  it("matches pages by keywords and returns pages only for an empty query", async () => {
    const { org, owner } = await makeOrg();
    await makeCampaign(org.id, { name: "Invite-only drop" });
    await signInAs(owner.id);
    const empty = await search(org.slug, "   ");
    expect(empty.groups.map((g) => g.kind)).toEqual(["page"]);
    const invite = await search(org.slug, "invite");
    expect(titles(invite, "page")).toEqual(["Members"]);
    expect(titles(invite, "campaign")).toEqual(["Invite-only drop"]);
  });

  it("only surfaces approved posts and creators associated with the organization", async () => {
    const { org, owner } = await makeOrg();
    const { org: other } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const rostered = await makeCreator({ displayName: "Avery Roster" });
    const applicant = await makeCreator({ displayName: "Avery Applicant" });
    const stranger = await makeCreator({ displayName: "Avery Stranger" });
    const db = await getDb();
    await db.insert(orgCreators).values({ orgId: org.id, creatorId: rostered.id });
    await db.insert(campaignMemberships).values({ campaignId: campaign.id, creatorId: applicant.id, orgId: org.id, status: "requested" });
    await db.insert(orgCreators).values({ orgId: other.id, creatorId: stranger.id });
    await db.insert(socialAccounts).values({ id: "acc_test_1", creatorId: rostered.id, platform: "tiktok", handle: "averycooks" });
    await makePost(org.id, rostered.id, { campaignId: campaign.id, handle: "averycooks", reviewStatus: "submitted" });

    await signInAs(owner.id);
    const results = await search(org.slug, "avery");
    expect(titles(results, "creator").sort()).toEqual(["Avery Applicant", "Avery Roster"]);
    expect(titles(results, "post")).toEqual([]);
    // Creators are also found by a social handle, with or without "@".
    expect(titles(await search(org.slug, "@averycooks"), "creator")).toEqual(["Avery Roster"]);
  });

  it("treats LIKE wildcards literally and validates query length", async () => {
    const { org, owner } = await makeOrg();
    await makeCampaign(org.id, { name: "Spring" });
    await makeCampaign(org.id, { name: "100% organic" });
    await signInAs(owner.id);
    expect(titles(await search(org.slug, "%"), "campaign")).toEqual(["100% organic"]);
    expect(titles(await search(org.slug, "_"), "campaign")).toEqual([]);
    expect(await searchWorkspaceAction(org.slug, "x".repeat(101))).toMatchObject({ ok: false, code: "validation" });
  });

  it("ranks prefix matches first and caps each group", async () => {
    const { org, owner } = await makeOrg();
    for (const name of ["Big launch", "Launch week", "Relaunch", "Launch day", "Prelaunch", "Launch party", "Launch recap"]) {
      await makeCampaign(org.id, { name });
    }
    await signInAs(owner.id);
    const found = titles(await search(org.slug, "launch"), "campaign");
    expect(found).toHaveLength(5);
    expect(found.slice(0, 4)).toEqual(["Launch day", "Launch party", "Launch recap", "Launch week"]);
  });

  it("finds campaigns by primary hashtag", async () => {
    const { org } = await makeOrg();
    const viewer = await addMember(org.id, "member", await makeUser());
    await makeCampaign(org.id, { name: "Autumn", primaryHashtag: "cozyseason" });
    await signInAs(viewer.id);
    expect(titles(await search(org.slug, "#cozy"), "campaign")).toEqual(["Autumn"]);
  });
});
