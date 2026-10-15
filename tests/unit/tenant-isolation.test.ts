/**
 * Cross-tenant isolation. Acting as the OWNER of workspace A (the most
 * privileged role a tenant can hold), every representative Server Action,
 * loader and API route is pointed at workspace B — by B's slug, or by A's slug
 * with B's entity IDs — and must answer not_found (or return no B data), and
 * B's records must be unchanged afterwards.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { createTestDb } from "../support/db";
import { addMember, makeCampaign, makeCreator, makeOrg, makePlaybook, makePost } from "../support/factories";
import { resetRequestContext, signInAs } from "../support/request-context";
import { getDb } from "@/server/db/client";
import {
  apiGrants,
  campaignMemberships,
  campaigns,
  integrationInstallations,
  invitations,
  memberships,
  orgCreators,
  organizations,
  playbooks,
  posts,
} from "@/server/db/schema";
import { changeCampaignBudgetAction, changeCampaignStatusAction, changePlaybookActiveAction, createPlaybookAction, loadBreakdownAction } from "@/app/home/[org]/(workspace)/campaigns/actions";
import { removeCreatorsAction, restoreCreatorsAction } from "@/app/home/[org]/(workspace)/creators/actions";
import { approveJoinRequestAction } from "@/app/home/[org]/(workspace)/creators/requests/actions";
import { changeMemberRoleAction, inviteMembersAction, removeMemberAction, revokeInvitationAction, transferOwnershipAction } from "@/app/home/[org]/(workspace)/members/actions";
import { createApiTokenAction, disconnectIntegrationAction, revokeApiTokenAction } from "@/app/home/[org]/(workspace)/integrations/actions";
import { saveBrandingAction } from "@/app/home/[org]/(workspace)/branding/actions";
import { updateThresholdAction } from "@/app/home/[org]/(workspace)/billing/actions";
import { setSidebarCollapsedAction } from "@/components/workspace/shell-actions";
import { loadLatestDraft, loadPlaybookEditor, publishPlaybook, saveDraft } from "@/server/playbooks";
import { loadAdSettings, saveAdSettings } from "@/server/ad-settings";
import { loadAdsOverview, saveLaunchDraft } from "@/server/ads";
import { loadNewCampaignFormAction } from "@/server/campaign-form";
import { listTeamMessagesAction, openTeamConversationAction, sendTeamMessageAction } from "@/server/messages";
import { searchWorkspaceAction } from "@/server/search";
import { reviewPostAction } from "@/server/ops/actions";
import { GET as apiPosts } from "@/app/api/v1/posts/route";
import { GET as apiCampaigns } from "@/app/api/v1/campaigns/route";

const range = { from: "2000-01-01", to: "2100-12-31" };

async function setup() {
  const db = await getDb();
  const a = await makeOrg({ slug: "tenant-a", name: "Tenant A" });
  const b = await makeOrg({ slug: "tenant-b", name: "Tenant B" });
  const bMember = await addMember(b.org.id, "member");

  const campaignB = await makeCampaign(b.org.id, { name: "Secret B campaign", primaryHashtag: "secretbtag" });
  const playbookB = await makePlaybook(b.org.id, campaignB.id, { name: "Secret B playbook" });
  const creatorB = await makeCreator({ displayName: "Secret B creator" });
  const postB = await makePost(b.org.id, creatorB.id, { campaignId: campaignB.id, playbookId: playbookB.id, handle: "secretbhandle" });
  await db.insert(orgCreators).values({ orgId: b.org.id, creatorId: creatorB.id });
  await db.insert(campaignMemberships).values({ campaignId: campaignB.id, creatorId: creatorB.id, orgId: b.org.id, status: "requested" });
  await db.insert(integrationInstallations).values({ id: newId("int"), orgId: b.org.id, provider: "tiktok_ads", status: "connected", grantedScopes: [], selectedAssets: [] });

  // B's own owner creates B-side records through the real commands.
  await signInAs(b.owner.id);
  expect(await inviteMembersAction(b.org.slug, { emails: ["invitee-b@example.test"], role: "member" })).toMatchObject({ ok: true });
  const grant = await createApiTokenAction(b.org.slug, { label: "B token", scopes: ["reports:read"], expiry: "30" });
  if (!grant.ok) throw new Error("grant setup failed");
  const conversation = await openTeamConversationAction(b.org.slug);
  if (!conversation.ok) throw new Error("conversation setup failed");
  expect(await sendTeamMessageAction(b.org.slug, { conversationId: conversation.data.conversationId, body: "Secret B message" })).toMatchObject({ ok: true });
  const [inviteB] = await db.select({ id: invitations.id }).from(invitations).where(eq(invitations.orgId, b.org.id));

  // A has its own data and a connected ad account so ads commands get past their prerequisites.
  const campaignA = await makeCampaign(a.org.id, { name: "A campaign" });
  await db.insert(integrationInstallations).values({ id: newId("int"), orgId: a.org.id, provider: "tiktok_ads", status: "connected", grantedScopes: [], selectedAssets: [] });

  resetRequestContext();
  await signInAs(a.owner.id);
  return { a, b, bMember, campaignA, campaignB, playbookB, creatorB, postB, inviteB, grantB: grant.data.grant, conversationB: conversation.data.conversationId };
}

describe("tenant isolation (owner of A against workspace B)", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("refuses B's slug with not_found for every area, exactly like a nonexistent workspace", async () => {
    const { b } = await setup();
    const calls: Array<[string, () => Promise<{ ok: boolean; code?: string }>]> = [
      ["shell", () => setSidebarCollapsedAction(b.org.slug, true)],
      ["branding", () => saveBrandingAction(b.org.slug, { name: "Hijacked" })],
      ["billing", () => updateThresholdAction(b.org.slug, { thresholdCents: 100_00, expectedVersion: 1 })],
      ["members", () => inviteMembersAction(b.org.slug, { emails: ["x@example.test"], role: "member" })],
      ["integrations", () => createApiTokenAction(b.org.slug, { label: "x", scopes: ["reports:read"], expiry: "30" })],
      ["ad settings", () => loadAdSettings(b.org.slug)],
      ["ads", () => loadAdsOverview(b.org.slug, { view: "all", range, page: 1 })],
      ["campaign form", () => loadNewCampaignFormAction(b.org.slug)],
      ["messages", () => openTeamConversationAction(b.org.slug)],
      ["search", () => searchWorkspaceAction(b.org.slug, "Secret")],
    ];
    for (const [area, call] of calls) {
      const viaB = await call();
      expect(viaB, area).toMatchObject({ ok: false, code: "not_found" });
    }
    // Same answer as a slug that does not exist at all.
    expect(await loadAdSettings("no-such-workspace")).toMatchObject({ ok: false, code: "not_found" });
    const db = await getDb();
    const [orgB] = await db.select().from(organizations).where(eq(organizations.id, b.org.id));
    expect(orgB.name).toBe("Tenant B");
  });

  it("refuses B's campaign, playbook, post and creator IDs under A's slug", async () => {
    const { a, b, campaignB, playbookB, postB, creatorB } = await setup();
    const slug = a.org.slug;
    const results = {
      status: await changeCampaignStatusAction(slug, { campaignId: campaignB.id, expectedVersion: campaignB.version, status: "active" }),
      budget: await changeCampaignBudgetAction(slug, { campaignId: campaignB.id, expectedVersion: campaignB.version, dailyBudgetCents: 900_00 }),
      playbookActive: await changePlaybookActiveAction(slug, { playbookId: playbookB.id, active: true }),
      newPlaybook: await createPlaybookAction(slug, { campaignId: campaignB.id }),
      breakdown: await loadBreakdownAction(slug, { kind: "campaign", ids: [campaignB.id], from: "2024-01-01", to: "2024-01-31" }),
      editor: await loadPlaybookEditor(slug, playbookB.id),
      latest: await loadLatestDraft(slug, playbookB.id),
      save: await saveDraft(slug, playbookB.id, playbookB.version, { name: "Hijacked", templateId: null, content: playbookB.content, descriptions: [], hashtags: [] } as never),
      publish: await publishPlaybook(slug, playbookB.id, playbookB.version, { makeActive: true }),
      removeCreator: await removeCreatorsAction(slug, { creatorIds: [creatorB.id] }),
      restoreCreator: await restoreCreatorsAction(slug, { creatorIds: [creatorB.id] }),
      joinRequest: await approveJoinRequestAction(slug, { campaignId: campaignB.id, creatorId: creatorB.id }),
    };
    for (const [name, result] of Object.entries(results)) expect(result, name).toMatchObject({ ok: false, code: "not_found" });

    // Ad launch draft from B's post: A has a connected account and website URL, so only the tenant check can refuse it.
    expect(
      await saveAdSettings(slug, 0, {
        copyTemplates: [],
        naming: { fields: [{ kind: "creator" }], separator: "_" },
        links: { websiteUrl: "https://example.com", params: [] },
        defaultCta: { meta: null, tiktok: null },
      }),
    ).toMatchObject({ ok: true });
    const draft = await saveLaunchDraft(slug, { provider: "tiktok_ads", source: { kind: "post", id: postB.id }, bodyCopy: "Copy", adNameOverride: null, cta: "SHOP_NOW", settingsVersion: 1 });
    expect(draft).toMatchObject({ ok: false, code: "not_found" });

    const db = await getDb();
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignB.id));
    expect(c).toMatchObject({ status: "inactive", version: campaignB.version, dailyBudgetCents: campaignB.dailyBudgetCents });
    const [p] = await db.select().from(playbooks).where(eq(playbooks.id, playbookB.id));
    expect(p).toMatchObject({ name: "Secret B playbook", status: "draft", active: false });
    expect(await db.select().from(playbooks).where(eq(playbooks.campaignId, campaignB.id))).toHaveLength(1);
    const [m] = await db.select().from(campaignMemberships).where(eq(campaignMemberships.campaignId, campaignB.id));
    expect(m.status).toBe("requested");
    const [oc] = await db.select().from(orgCreators).where(eq(orgCreators.creatorId, creatorB.id));
    expect(oc.orgId).toBe(b.org.id);
    expect(oc.removedAt).toBeNull();
    expect(await db.select().from(orgCreators).where(eq(orgCreators.orgId, a.org.id))).toHaveLength(0);
  });

  it("refuses B's teammates, invitations, API tokens and conversations under A's slug", async () => {
    const { a, b, bMember, inviteB, grantB, conversationB } = await setup();
    const slug = a.org.slug;
    expect(await changeMemberRoleAction(slug, { userId: bMember.id, role: "owner" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await removeMemberAction(slug, { userId: bMember.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await transferOwnershipAction(slug, { userId: b.owner.id, password: "whatever password" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await revokeInvitationAction(slug, { id: inviteB.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await revokeApiTokenAction(slug, { id: grantB.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await listTeamMessagesAction(slug, { conversationId: conversationB })).toMatchObject({ ok: false, code: "not_found" });
    expect(await sendTeamMessageAction(slug, { conversationId: conversationB, body: "Injected" })).toMatchObject({ ok: false, code: "not_found" });
    // Disconnecting "tiktok_ads" in A never touches B's installation.
    await disconnectIntegrationAction(slug, "tiktok_ads");

    const db = await getDb();
    const [membership] = await db.select().from(memberships).where(eq(memberships.userId, bMember.id));
    expect(membership).toMatchObject({ orgId: b.org.id, role: "member" });
    const [invite] = await db.select().from(invitations).where(eq(invitations.id, inviteB.id));
    expect(invite.status).toBe("pending");
    const [grant] = await db.select().from(apiGrants).where(eq(apiGrants.id, grantB.id));
    expect(grant.revokedAt).toBeNull();
    const [installB] = await db.select().from(integrationInstallations).where(eq(integrationInstallations.orgId, b.org.id));
    expect(installB.status).toBe("connected");
    const [orgB] = await db.select().from(organizations).where(eq(organizations.id, b.org.id));
    expect(orgB.primaryOwnerUserId).toBe(b.owner.id);
  });

  it("never returns B's records from A's reads (search, ads, messages)", async () => {
    const { a } = await setup();
    const search = await searchWorkspaceAction(a.org.slug, "Secret");
    expect(search.ok).toBe(true);
    expect(JSON.stringify(search)).not.toMatch(/Secret B/);
    expect(await searchWorkspaceAction(a.org.slug, "secretbhandle")).toMatchObject({ ok: true, data: { groups: [] } });
    expect(await searchWorkspaceAction(a.org.slug, "secretbtag")).toMatchObject({ ok: true, data: { groups: [] } });
    const ads = await loadAdsOverview(a.org.slug, { view: "all", range, page: 1 });
    expect(ads).toMatchObject({ ok: true, data: { total: 0 } });
    const team = await openTeamConversationAction(a.org.slug);
    expect(team.ok && team.data.messages).toEqual([]);
  });

  it("scopes the Reporting API to the token's workspace, whatever IDs the request names", async () => {
    const { a, campaignA, campaignB, postB } = await setup();
    const grant = await createApiTokenAction(a.org.slug, { label: "A token", scopes: ["reports:read", "campaigns:read"], expiry: "30" });
    if (!grant.ok) throw new Error("grant failed");
    const auth = { authorization: `Bearer ${grant.data.token}` };
    const postsRes = await apiPosts(new Request(`http://localhost/api/v1/posts?start_date=2000-01-01&end_date=2000-12-31&campaign_id=${campaignB.id}`, { headers: auth }));
    expect(postsRes.status).toBe(200);
    const postsBody = await postsRes.text();
    expect(postsBody).not.toContain(postB.id);
    const choices = (await (await apiCampaigns(new Request("http://localhost/api/v1/campaigns", { headers: auth }))).json()) as { data: Array<{ id: string }> };
    expect(choices.data.map((c) => c.id)).toEqual([campaignA.id]);
    // No token, or a revoked one, is refused.
    expect((await apiCampaigns(new Request("http://localhost/api/v1/campaigns"))).status).toBe(401);
    expect(await revokeApiTokenAction(a.org.slug, { id: grant.data.grant.id })).toMatchObject({ ok: true });
    expect((await apiCampaigns(new Request("http://localhost/api/v1/campaigns", { headers: auth }))).status).toBe(401);
  });

  it("keeps the operator review queue closed to workspace owners", async () => {
    const { postB } = await setup();
    const form = new FormData();
    form.set("decision", "approve");
    form.set("postId", postB.id);
    expect(await reviewPostAction(null, form)).toMatchObject({ ok: false, code: "not_found" });
    const db = await getDb();
    const [row] = await db.select({ reviewStatus: posts.reviewStatus }).from(posts).where(eq(posts.id, postB.id));
    expect(row.reviewStatus).toBe("approved");
  });

  it("gives members of A no owner-only commands in A, and nothing at all in B", async () => {
    const { a, b, campaignA } = await setup();
    const member = await addMember(a.org.id, "member");
    resetRequestContext();
    await signInAs(member.id);
    expect(await changeCampaignStatusAction(a.org.slug, { campaignId: campaignA.id, expectedVersion: campaignA.version, status: "active" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await updateThresholdAction(a.org.slug, { thresholdCents: 100_00, expectedVersion: 1 })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await createApiTokenAction(a.org.slug, { label: "x", scopes: ["reports:read"], expiry: "30" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await inviteMembersAction(a.org.slug, { emails: ["x@example.test"], role: "member" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await saveBrandingAction(b.org.slug, {})).toMatchObject({ ok: false, code: "not_found" });
  });
});
