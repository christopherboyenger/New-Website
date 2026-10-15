import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeCampaign, makeOrg, makeUser } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { firstInvalidField, type CampaignFormSubmission } from "@/components/campaign-form/model";
import { getDb } from "./db/client";
import { auditLog, campaigns } from "./db/schema";
import { setForecastModel } from "./forecast";
import { checkCampaignHashtagAction, createCampaignAction, estimateCampaignReachAction, loadNewCampaignFormAction } from "./campaign-form";

function submission(overrides: Partial<CampaignFormSubmission> = {}): CampaignFormSubmission {
  return {
    name: "Spring launch",
    primaryHashtag: "#SpringLaunch",
    format: "slideshow",
    pricingMode: "daily",
    dailyBudgetCents: 500_00,
    cpmCapCents: null,
    targeting: { countries: [], platforms: [], ageMin: null, ageMax: null, gender: "any", metros: [], minCreatorLevel: "all" },
    approvals: { requireCreatorApproval: false, requireDedicatedAccount: false },
    ...overrides,
  };
}

const gatedTargeting: CampaignFormSubmission["targeting"] = {
  countries: ["US", "CA", "US"],
  platforms: ["tiktok", "instagram"],
  ageMin: 18,
  ageMax: 34,
  gender: "female",
  metros: ["new-york", "seattle"],
  minCreatorLevel: "gold",
};

async function campaignRows() {
  const db = await getDb();
  return db.select().from(campaigns);
}

describe("createCampaignAction", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("creates an Inactive campaign with every setting on the Unlimited plan and points back to Campaigns", async () => {
    const { org, owner } = await makeOrg({ planId: "unlimited", slug: "acme-unlimited" });
    await signInAs(owner.id);

    const result = await createCampaignAction(
      org.slug,
      submission({
        format: "ugc",
        dailyBudgetCents: 750_50,
        cpmCapCents: 4_25,
        targeting: gatedTargeting,
        approvals: { requireCreatorApproval: true, requireDedicatedAccount: true },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toMatch(/Inactive until you activate it/);
    expect(result.data.href).toBe(`/home/acme-unlimited/campaigns?tab=campaigns&created=${result.data.campaignId}`);

    const [row] = await campaignRows();
    expect(row).toMatchObject({
      id: result.data.campaignId,
      orgId: org.id,
      name: "Spring launch",
      primaryHashtag: "springlaunch",
      format: "ugc",
      status: "inactive",
      pricingMode: "daily",
      dailyBudgetCents: 750_50,
      cpmCapCents: 4_25,
      createdByUserId: owner.id,
      activatedAt: null,
    });
    expect(row.targeting).toEqual({ ...gatedTargeting, countries: ["US", "CA"] });
    expect(row.approvals).toEqual({ requireCreatorApproval: true, requireDedicatedAccount: true });

    const db = await getDb();
    const audit = await db.select().from(auditLog).where(eq(auditLog.targetId, row.id));
    expect(audit.map((a) => a.action)).toEqual(["campaign.create"]);
  });

  it("creates with defaults on the Standard (basic) plan", async () => {
    const { org, owner } = await makeOrg({ planId: "basic" });
    await signInAs(owner.id);
    const result = await createCampaignAction(org.slug, submission({ targeting: { ...submission().targeting, countries: ["GB"], platforms: ["youtube"] } }));
    expect(result.ok).toBe(true);
    const [row] = await campaignRows();
    expect(row.status).toBe("inactive");
    expect(row.targeting.countries).toEqual(["GB"]);
  });

  it("maps validation issues to field keys and sections without creating anything", async () => {
    const { org, owner } = await makeOrg({ planId: "unlimited" });
    await signInAs(owner.id);

    const result = await createCampaignAction(
      org.slug,
      submission({
        name: "   ",
        primaryHashtag: "#a",
        dailyBudgetCents: 49_99,
        cpmCapCents: 0,
        targeting: { ...gatedTargeting, ageMin: 40, ageMax: 20, countries: ["CA", "ZZ"] },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation");
    expect(result.fieldErrors).toMatchObject({
      name: "Enter a campaign name.",
      primaryHashtag: "Use 2–50 letters, numbers or underscores.",
      dailyBudgetCents: "The minimum daily budget is $50.",
      cpmCapCents: "Enter a CPM cap above $0, or leave it empty.",
      "targeting.ageMin": "Minimum age must be at or below maximum age.",
    });
    // "ZZ" fails the shared schema's shape check only if malformed; catalog membership is this form's rule.
    expect(result.fieldErrors?.["targeting.countries"]).toBe("Choose countries from the list.");
    expect(firstInvalidField(result.fieldErrors ?? {})).toMatchObject({ section: "details", fieldId: "campaign-name" });
    expect(await campaignRows()).toHaveLength(0);
  });

  it("reports mistyped values with readable messages and nested paths on their field", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const result = await createCampaignAction(org.slug, { ...submission(), dailyBudgetCents: "500", targeting: { ...submission().targeting, countries: ["usa"] } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.dailyBudgetCents).toBe("Enter a daily budget in dollars.");
    expect(result.fieldErrors?.["targeting.countries"]).toBeDefined();
    expect(Object.keys(result.fieldErrors ?? {}).some((k) => k.startsWith("targeting.countries."))).toBe(false);
    expect(firstInvalidField(result.fieldErrors ?? {})).toMatchObject({ section: "budget", fieldId: "budget-amount" });
  });

  it("requires US creators to be in scope for metro targeting", async () => {
    const { org, owner } = await makeOrg({ planId: "unlimited" });
    await signInAs(owner.id);
    const result = await createCampaignAction(org.slug, submission({ targeting: { ...gatedTargeting, countries: ["CA"] } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.["targeting.metros"]).toMatch(/Add United States to Countries/);
    expect(firstInvalidField(result.fieldErrors ?? {})).toMatchObject({ section: "targeting", fieldId: "locations-filter-trigger" });

    const unknownMetro = await createCampaignAction(org.slug, submission({ targeting: { ...gatedTargeting, metros: ["springfield"] } }));
    expect(!unknownMetro.ok && unknownMetro.fieldErrors?.["targeting.metros"]).toBe("Choose metro areas from the list.");
    expect(await campaignRows()).toHaveLength(0);
  });

  it("rejects Manual pricing on every plan because no rate-card model exists", async () => {
    for (const planId of ["basic", "unlimited"] as const) {
      const { org, owner } = await makeOrg({ planId });
      await signInAs(owner.id);
      const result = await createCampaignAction(org.slug, submission({ pricingMode: "manual", primaryHashtag: `manual${planId}` }));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors?.pricingMode).toMatch(/Manual pricing isn't available yet/);
    }
    expect(await campaignRows()).toHaveLength(0);
  });

  it("rejects Unlimited-only settings on the basic plan with a field error per gated setting", async () => {
    const { org, owner } = await makeOrg({ planId: "basic" });
    await signInAs(owner.id);
    const result = await createCampaignAction(
      org.slug,
      submission({ cpmCapCents: 5_00, targeting: gatedTargeting, approvals: { requireCreatorApproval: true, requireDedicatedAccount: true } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("entitlement");
    expect(result.error).toMatch(/Unlimited plan/);
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(
      ["approvals.requireCreatorApproval", "approvals.requireDedicatedAccount", "cpmCapCents", "targeting.ageMin", "targeting.minCreatorLevel"].sort(),
    );
    expect(firstInvalidField(result.fieldErrors ?? {})).toMatchObject({ section: "budget", fieldId: "cpm-cap" });
    expect(await campaignRows()).toHaveLength(0);
  });

  it("reports a hashtag already used by any workspace as a conflict on the hashtag field", async () => {
    const other = await makeOrg();
    await makeCampaign(other.org.id, { primaryHashtag: "springlaunch" });
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);

    const result = await createCampaignAction(org.slug, submission({ primaryHashtag: "#SPRINGLAUNCH" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("conflict");
    expect(result.fieldErrors?.primaryHashtag).toMatch(/already used by another campaign/);
    expect(firstInvalidField(result.fieldErrors ?? {})).toMatchObject({ section: "details", fieldId: "campaign-hashtag" });
    expect((await campaignRows()).filter((c) => c.orgId === org.id)).toHaveLength(0);
  });

  it("forbids Members from creating campaigns", async () => {
    const { org } = await makeOrg({ planId: "unlimited" });
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    const result = await createCampaignAction(org.slug, submission());
    expect(result).toMatchObject({ ok: false, code: "forbidden", error: "Only workspace owners can create or change campaigns." });
    expect(await campaignRows()).toHaveLength(0);
  });

  it("treats another workspace and a nonexistent workspace identically (not found)", async () => {
    const mine = await makeOrg();
    const theirs = await makeOrg({ slug: "their-brand" });
    await signInAs(mine.owner.id);

    const other = await createCampaignAction(theirs.org.slug, submission());
    const missing = await createCampaignAction("no-such-brand", submission());
    expect(other).toMatchObject({ ok: false, code: "not_found" });
    expect(missing).toEqual(other);
    expect(await campaignRows()).toHaveLength(0);
  });

  it("rejects signed-out requests", async () => {
    const { org } = await makeOrg();
    const result = await createCampaignAction(org.slug, submission());
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("checkCampaignHashtagAction", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("reports available, taken (in any workspace) and invalid hashtags", async () => {
    const other = await makeOrg();
    await makeCampaign(other.org.id, { primaryHashtag: "takentag" });
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);

    expect(await checkCampaignHashtagAction(org.slug, "#FreshTag")).toEqual({ ok: true, data: { tag: "freshtag", status: "available" } });
    expect(await checkCampaignHashtagAction(org.slug, "TakenTag")).toEqual({ ok: true, data: { tag: "takentag", status: "taken" } });
    const invalid = await checkCampaignHashtagAction(org.slug, "no spaces!");
    expect(invalid.ok && invalid.data.status).toBe("invalid");
    expect((await checkCampaignHashtagAction(org.slug, 42)).ok).toBe(false);
  });

  it("is limited per user and only available to campaign managers of the workspace", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    expect(await checkCampaignHashtagAction(org.slug, "anything")).toMatchObject({ ok: false, code: "forbidden" });

    const outsider = await makeUser();
    await signInAs(outsider.id);
    expect(await checkCampaignHashtagAction(org.slug, "anything")).toMatchObject({ ok: false, code: "not_found" });

    await signInAs(owner.id);
    // Freeze the clock so all 61 checks fall in the same one-minute window.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:30Z"));
    try {
      let last;
      for (let i = 0; i < 61; i++) last = await checkCampaignHashtagAction(org.slug, `tag${i}x`);
      expect(last).toMatchObject({ ok: false, code: "rate_limited" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("loadNewCampaignFormAction", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("recommends org-name hashtags that are not already taken, plus plan and billing context for owners", async () => {
    const other = await makeOrg();
    await makeCampaign(other.org.id, { primaryHashtag: "joinpipspops" });
    const { org, owner } = await makeOrg({ name: "Pip's Pops", planId: "basic" });
    await signInAs(owner.id);

    const result = await loadNewCampaignFormAction(org.slug);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendedHashtags).toEqual(["tryPipsPops", "PipsPopsApp"]);
    expect(result.data.hashtagPlaceholder).toBe("pipspops");
    expect(result.data).toMatchObject({
      canManage: true,
      billingHref: `/home/${org.slug}/billing`,
      plan: { id: "basic", name: "Standard" },
      unlimitedPlanName: "Unlimited",
      entitlements: { cpm_cap: false, creator_approval: false, demographic_targeting: false },
      initialForecast: { status: "unavailable" },
    });
  });

  it("unlocks gated settings on Unlimited and gives Members a read-only view without recommendations", async () => {
    const { org, owner } = await makeOrg({ planId: "unlimited" });
    await signInAs(owner.id);
    const asOwner = await loadNewCampaignFormAction(org.slug);
    expect(asOwner.ok && Object.values(asOwner.data.entitlements).every(Boolean)).toBe(true);

    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    const asMember = await loadNewCampaignFormAction(org.slug);
    expect(asMember).toMatchObject({ ok: true, data: { canManage: false, billingHref: null, recommendedHashtags: [], initialForecast: null } });

    const outsider = await makeUser();
    await signInAs(outsider.id);
    expect(await loadNewCampaignFormAction(org.slug)).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("estimateCampaignReachAction", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });
  afterEach(() => setForecastModel(null));

  const input = { dailyBudgetCents: 500_00, format: "ugc", targeting: submission().targeting };

  it("returns the forecast contract unchanged: unavailable until a model is configured", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const result = await estimateCampaignReachAction(org.slug, input);
    expect(result).toMatchObject({ ok: true, data: { status: "unavailable" } });
    expect(result.ok && result.data.status === "unavailable" && result.data.reason).toMatch(/no forecasting model/);

    setForecastModel({
      async forecast(i) {
        return {
          status: "available",
          periodDays: 30,
          monthlyViews: { low: i.dailyBudgetCents, high: i.dailyBudgetCents * 2 },
          monthlyPosts: { low: 1, high: 2 },
          creators: { low: 1, high: 2 },
          assumptions: ["test model"],
          modelVersion: "test",
          generatedAt: "2026-10-15T00:00:00.000Z",
        };
      },
    });
    const available = await estimateCampaignReachAction(org.slug, input);
    expect(available).toMatchObject({ ok: true, data: { status: "available", monthlyViews: { low: 500_00, high: 1_000_00 } } });
  });

  it("validates input and requires campaign:manage in the workspace", async () => {
    const { org } = await makeOrg();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    expect(await estimateCampaignReachAction(org.slug, input)).toMatchObject({ ok: false, code: "forbidden" });
    await signInAs(org.primaryOwnerUserId);
    expect(await estimateCampaignReachAction(org.slug, { ...input, format: "dedicated" })).toMatchObject({ ok: false, code: "validation" });
  });
});
