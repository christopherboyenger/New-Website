import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeCampaign, makeCreator, makeOrg, makePost } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { newId } from "@/lib/ids";
import type { IntegrationStatus } from "./db/schema";
import { saveAdSettings } from "./ad-settings";
import { loadAdsOverview, loadLaunchDraftForm, saveLaunchDraft, type LaunchDraftInput } from "./ads";
import { getDb } from "./db/client";
import { adLaunches, adRightsGrants, adSubmissions, integrationInstallations } from "./db/schema";

const range = { from: "2000-01-01", to: "2100-12-31" };

async function connect(
  orgId: string,
  provider: "meta_ads" | "tiktok_ads",
  status: IntegrationStatus = "connected",
  grantedScopes: string[] = provider === "meta_ads" ? ["ads_read", "ads_management"] : [],
) {
  const db = await getDb();
  await db.insert(integrationInstallations).values({ id: newId("int"), orgId, provider, status, grantedScopes, selectedAssets: [{ id: "act_1", name: "Test ad account", kind: "ad_account" }] });
}

async function grant(orgId: string, post: { id: string; creatorId: string }, overrides: Partial<typeof adRightsGrants.$inferInsert> = {}) {
  const db = await getDb();
  await db.insert(adRightsGrants).values({
    id: `rgt_${post.id}`,
    orgId,
    creatorId: post.creatorId,
    postId: post.id,
    providers: ["tiktok_ads", "meta_ads"],
    evidenceKind: "signed_agreement",
    evidenceReference: "agreement-1",
    grantedAt: new Date(Date.now() - 86_400_000),
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    ...overrides,
  });
}

async function setup() {
  const { org, owner } = await makeOrg({ slug: "brand-a", name: "Brand A" });
  const campaign = await makeCampaign(org.id);
  const creator = await makeCreator({ displayName: "Jo Maker" });
  const post = await makePost(org.id, creator.id, { platform: "tiktok", handle: "jo.makes", externalId: "7300000000", campaignId: campaign.id });
  await signInAs(owner.id);
  const saved = await saveAdSettings(org.slug, 0, {
    copyTemplates: ["By {{creator}}"],
    naming: { fields: [{ kind: "custom", value: "Brand" }, { kind: "creator" }], separator: "_" },
    links: { websiteUrl: "https://example.com", params: [{ key: "utm_source", value: "{{platform}}" }] },
    defaultCta: { meta: "LEARN_MORE", tiktok: "SHOP_NOW" },
  });
  if (!saved.ok) throw new Error("settings setup failed");
  return { org, owner, creator, post };
}

const draft = (sourceId: string, overrides: Partial<LaunchDraftInput> = {}): LaunchDraftInput => ({
  provider: "tiktok_ads",
  source: { kind: "post", id: sourceId },
  bodyCopy: "By Jo Maker",
  adNameOverride: null,
  cta: "SHOP_NOW",
  settingsVersion: 1,
  ...overrides,
});

describe("launch drafts", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("is blocked without a connected installation for the provider", async () => {
    const { org, post } = await setup();
    await grant(org.id, post);
    expect(await saveLaunchDraft(org.slug, draft(post.id))).toMatchObject({ ok: false, code: "validation", fieldErrors: { provider: expect.any(String) } });
    await connect(org.id, "tiktok_ads", "reauthorization_required");
    expect(await saveLaunchDraft(org.slug, draft(post.id))).toMatchObject({ ok: false, code: "validation" });
    const db = await getDb();
    expect(await db.select().from(adLaunches)).toHaveLength(0);
  });

  it("requires the Meta connection to include ads_management", async () => {
    const { org, post } = await setup();
    await grant(org.id, post);
    await connect(org.id, "meta_ads", "connected", ["ads_read"]);
    const form = await loadLaunchDraftForm(org.slug);
    expect(form.ok && form.data.connection.connected).toEqual([]);
    expect(form.ok && form.data.connection.installations).toMatchObject([{ provider: "meta_ads", status: "connected", missingLaunchScopes: ["ads_management"] }]);
    const r = await saveLaunchDraft(org.slug, draft(post.id, { provider: "meta_ads", cta: "LEARN_MORE", bodyCopy: "By Jo Maker" }));
    expect(r).toMatchObject({ ok: false, code: "validation", fieldErrors: { provider: expect.stringMatching(/ad management/) } });
    const db = await getDb();
    expect(await db.select().from(adLaunches)).toHaveLength(0);
  });

  it("creates a draft with generated name, resolved URL and rights evidence — and nothing beyond draft", async () => {
    const { org, post } = await setup();
    await connect(org.id, "tiktok_ads");
    await grant(org.id, post);
    const r = await saveLaunchDraft(org.slug, draft(post.id));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.adName).toBe(`Brand_jo.makes_${post.id}`);
    expect(r.data.destinationUrl).toBe("https://example.com/?utm_source=tiktok");
    const db = await getDb();
    const [row] = await db.select().from(adLaunches);
    expect(row).toMatchObject({ orgId: org.id, stage: "draft", provider: "tiktok_ads", postId: post.id, cta: "SHOP_NOW", externalIds: {} });
    expect(row.rightsEvidence).toMatchObject({ kind: "post_grant", evidenceKind: "signed_agreement" });
  });

  it("uses an individual override for the ad name", async () => {
    const { org, post } = await setup();
    await connect(org.id, "tiktok_ads");
    await grant(org.id, post);
    const r = await saveLaunchDraft(org.slug, draft(post.id, { adNameOverride: "Hero cut" }));
    expect(r.ok && r.data.adName).toBe("Hero cut");
  });

  it("rejects ineligible posts: no rights, expired, revoked, wrong provider, unapproved", async () => {
    const { org, post, creator } = await setup();
    await connect(org.id, "tiktok_ads");
    await connect(org.id, "meta_ads");
    expect(await saveLaunchDraft(org.slug, draft(post.id))).toMatchObject({ ok: false, error: "No paid-use rights recorded from the creator." });

    const expired = await makePost(org.id, creator.id, { platform: "tiktok", externalId: "1" });
    await grant(org.id, expired, { expiresAt: new Date(Date.now() - 1000) });
    expect(await saveLaunchDraft(org.slug, draft(expired.id))).toMatchObject({ ok: false, error: "Paid-use rights have expired." });

    const revoked = await makePost(org.id, creator.id, { platform: "tiktok", externalId: "2" });
    await grant(org.id, revoked, { revokedAt: new Date() });
    expect(await saveLaunchDraft(org.slug, draft(revoked.id))).toMatchObject({ ok: false, error: "The creator revoked paid-use rights." });

    const metaOnly = await makePost(org.id, creator.id, { platform: "tiktok", externalId: "3" });
    await grant(org.id, metaOnly, { providers: ["meta_ads"] });
    expect(await saveLaunchDraft(org.slug, draft(metaOnly.id))).toMatchObject({ ok: false, error: "The creator's rights don't cover TikTok." });

    await grant(org.id, post);
    expect(await saveLaunchDraft(org.slug, draft(post.id, { provider: "meta_ads", cta: "LEARN_MORE" }))).toMatchObject({ ok: false, error: "Meta ads can't run TikTok posts." });

    const pending = await makePost(org.id, creator.id, { platform: "tiktok", externalId: "4", reviewStatus: "submitted" });
    await grant(org.id, pending);
    expect(await saveLaunchDraft(org.slug, draft(pending.id))).toMatchObject({ ok: false, code: "validation" });

    const db = await getDb();
    expect(await db.select().from(adLaunches)).toHaveLength(0);
  });

  it("drafts accepted submissions with rights and rejects those without", async () => {
    const { org, creator } = await setup();
    await connect(org.id, "meta_ads");
    const db = await getDb();
    await db.insert(adSubmissions).values([
      { id: "sub_ok", orgId: org.id, creatorId: creator.id, mediaAssetId: "med_1", status: "accepted", rightsGrantedAt: new Date() },
      { id: "sub_norights", orgId: org.id, creatorId: creator.id, mediaAssetId: "med_2", status: "accepted" },
      { id: "sub_pending", orgId: org.id, creatorId: creator.id, mediaAssetId: "med_3", status: "submitted", rightsGrantedAt: new Date() },
    ]);
    const input = (id: string) => draft(id, { provider: "meta_ads", cta: "LEARN_MORE", source: { kind: "submission", id } });
    expect(await saveLaunchDraft(org.slug, input("sub_norights"))).toMatchObject({ ok: false, error: "No paid-use rights recorded from the creator." });
    expect(await saveLaunchDraft(org.slug, input("sub_pending"))).toMatchObject({ ok: false, error: "Accept the submission first." });
    const r = await saveLaunchDraft(org.slug, input("sub_ok"));
    expect(r.ok && r.data.adName).toBe("Brand_Jo-Maker_sub_ok");
    expect(await saveLaunchDraft(org.slug, input("sub_ok"))).toMatchObject({ ok: false, code: "conflict" });
  });

  it("rejects drafts built from stale ad settings, bad CTAs and leftover tokens", async () => {
    const { org, post } = await setup();
    await connect(org.id, "tiktok_ads");
    await grant(org.id, post);
    expect(await saveLaunchDraft(org.slug, draft(post.id, { settingsVersion: 0 }))).toMatchObject({ ok: false, code: "conflict" });
    expect(await saveLaunchDraft(org.slug, draft(post.id, { cta: "LEARN_MORE_PLEASE" }))).toMatchObject({ ok: false, fieldErrors: { cta: expect.any(String) } });
    expect(await saveLaunchDraft(org.slug, draft(post.id, { bodyCopy: "By {{creator}}" }))).toMatchObject({ ok: false, fieldErrors: { bodyCopy: expect.any(String) } });
  });

  it("forbids members and isolates tenants", async () => {
    const { org, post } = await setup();
    await connect(org.id, "tiktok_ads");
    await grant(org.id, post);

    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    expect(await saveLaunchDraft(org.slug, draft(post.id))).toMatchObject({ ok: false, code: "forbidden" });
    const memberForm = await loadLaunchDraftForm(org.slug);
    expect(memberForm.ok && memberForm.data.canLaunch).toBe(false);
    expect(memberForm.ok && memberForm.data.candidates).toEqual([]);

    // Another org's owner can neither reach this org nor use its post.
    const { org: other, owner: otherOwner } = await makeOrg({ slug: "brand-b" });
    await connect(other.id, "tiktok_ads");
    await signInAs(otherOwner.id);
    expect(await saveLaunchDraft(org.slug, draft(post.id))).toMatchObject({ ok: false, code: "not_found" });
    expect(await loadAdsOverview(org.slug, { view: "all", range, page: 1 })).toMatchObject({ ok: false, code: "not_found" });
    await saveAdSettings(other.slug, 0, {
      copyTemplates: [],
      naming: { fields: [], separator: "_" },
      links: { websiteUrl: "https://example.org", params: [] },
      defaultCta: { meta: null, tiktok: null },
    });
    expect(await saveLaunchDraft(other.slug, draft(post.id))).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("ads overview", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("reports connection state and lists only this org's launches and submissions", async () => {
    const { org, post, creator } = await setup();
    let r = await loadAdsOverview(org.slug, { view: "all", range, page: 1 });
    expect(r.ok && r.data.connection.connected).toEqual([]);

    await connect(org.id, "tiktok_ads");
    await grant(org.id, post);
    await saveLaunchDraft(org.slug, draft(post.id));
    const { org: other } = await makeOrg({ slug: "brand-b" });
    const db = await getDb();
    await db.insert(adSubmissions).values([
      { id: "sub_mine", orgId: org.id, creatorId: creator.id, note: "Cut for paid", status: "submitted" },
      { id: "sub_other", orgId: other.id, creatorId: creator.id, status: "submitted" },
    ]);

    r = await loadAdsOverview(org.slug, { view: "all", range, page: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.connection).toMatchObject({ connected: ["tiktok_ads"], installations: [{ provider: "tiktok_ads", accountName: "Test ad account" }] });
    expect(r.data.launches).toHaveLength(1);
    expect(r.data.launches[0]).toMatchObject({ stage: "draft", source: { kind: "post", handle: "jo.makes", creatorName: "Jo Maker" } });

    const subs = await loadAdsOverview(org.slug, { view: "submissions", range, page: 1 });
    expect(subs.ok && subs.data.submissions.map((s) => s.id)).toEqual(["sub_mine"]);

    const outOfRange = await loadAdsOverview(org.slug, { view: "submissions", range: { from: "2001-01-01", to: "2001-01-31" }, page: 1 });
    expect(outOfRange.ok && outOfRange.data.total).toBe(0);
  });

  it("explains why candidates are not eligible", async () => {
    const { org, post } = await setup();
    await connect(org.id, "tiktok_ads");
    const r = await loadLaunchDraftForm(org.slug);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.data.candidates.find((x) => x.id === post.id)!;
    expect(c.eligibility.tiktok_ads).toEqual({ eligible: false, reason: "No paid-use rights recorded from the creator." });
    expect(c.rightsSummary).toBe("No rights recorded");
    expect(r.data.settingsVersion).toBe(1);
  });
});
