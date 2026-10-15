import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { makeCampaign, makeOrg, makeUser } from "../../tests/support/factories";
import type { OnboardingStepKey } from "@/domain/onboarding";
import { getDb } from "./db/client";
import { auditLog, billingAccounts, campaigns, memberships, onboardingDrafts, organizations, playbooks } from "./db/schema";
import { beginPaymentSetup, checkPaymentStatus, completeOnboarding, estimateReach, loadOnboardingView, saveOnboardingStep } from "./onboarding";

const script: Array<[OnboardingStepKey, Record<string, unknown>]> = [
  ["role", { role: "founder" }],
  ["overview", {}],
  ["referral", { referralSource: "code", referralCode: "SPRING26" }],
  ["brand", { brandName: "Juniper & Co.", brandWebsite: "juniper.example", brandDescription: "Refillable home cleaning kits." }],
  ["budget", { dailyBudgetCents: 150_00 }],
  ["summary", {}],
  ["format", { format: "ugc" }],
  ["template", { templateId: "ugc-hook-demo" }],
  ["billing", { billingThresholdCents: 25_00 }],
];

/** Saves every screen up to and including `last`, asserting each save succeeds. */
async function saveThrough(last: OnboardingStepKey, overrides: Partial<Record<OnboardingStepKey, Record<string, unknown>>> = {}, startNew = false) {
  for (const [step, answers] of script) {
    const result = await saveOnboardingStep({ step, answers: overrides[step] ?? answers, startNew });
    if (!result.ok) throw new Error(`save ${step} failed: ${result.error}`);
    if (step === last) return result.data;
  }
  throw new Error(`unknown step ${last}`);
}

async function orgsOwnedBy(userId: string) {
  const db = await getDb();
  return db.select().from(organizations).where(eq(organizations.primaryOwnerUserId, userId));
}

async function draftOf(userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(onboardingDrafts).where(eq(onboardingDrafts.userId, userId));
  return row;
}

async function markPaymentReady(orgId: string) {
  const db = await getDb();
  await db.update(billingAccounts).set({ paymentMethodStatus: "ready", paymentMethodBrand: "visa", paymentMethodLast4: "4242" }).where(eq(billingAccounts.orgId, orgId));
}

describe("onboarding server commands", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("rejects a signed-out user on every command", async () => {
    for (const result of [
      await saveOnboardingStep({ step: "role", answers: { role: "founder" } }),
      await completeOnboarding({ deferPayment: true }),
      await estimateReach({ dailyBudgetCents: 100_00 }),
      await beginPaymentSetup(),
      await checkPaymentStatus(),
    ]) {
      expect(result.ok).toBe(false);
      expect(!result.ok && result.code).toBe("forbidden");
    }
    const db = await getDb();
    expect(await db.select().from(onboardingDrafts)).toHaveLength(0);
  });

  it("saves each screen and resumes at the furthest saved screen", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    const fresh = await loadOnboardingView(user.id, { startNew: false });
    expect(fresh).toMatchObject({ kind: "wizard", step: "role", answers: {}, org: null });

    const saved = await saveOnboardingStep({ step: "role", answers: { role: "creator" } });
    expect(saved.ok && saved.data.step).toBe("overview");
    expect(await loadOnboardingView(user.id, { startNew: false })).toMatchObject({ kind: "wizard", step: "overview", answers: { role: "creator" } });

    await saveThrough("budget");
    const resumed = await loadOnboardingView(user.id, { startNew: false });
    expect(resumed).toMatchObject({
      kind: "wizard",
      step: "summary",
      answers: { role: "founder", referralSource: "code", referralCode: "SPRING26", brandName: "Juniper & Co.", dailyBudgetCents: 150_00 },
      org: { name: "Juniper & Co." },
    });
    expect(resumed.kind === "wizard" && resumed.forecast.status).toBe("unavailable");

    // Going back and re-saving an earlier screen keeps the furthest screen reached.
    await saveOnboardingStep({ step: "referral", answers: { referralSource: "podcast" } });
    const after = await loadOnboardingView(user.id, { startNew: false });
    expect(after).toMatchObject({ step: "summary", answers: { referralSource: "podcast" } });
    expect(after.kind === "wizard" && after.answers.referralCode).toBeUndefined();
  });

  it("refuses to skip screens and reports field errors", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    const skipped = await saveOnboardingStep({ step: "brand", answers: script[3][1] });
    expect(skipped).toMatchObject({ ok: false, code: "validation", error: "Complete “About you” first." });

    await saveThrough("referral");
    const invalid = await saveOnboardingStep({ step: "brand", answers: { brandName: "Juniper", brandWebsite: "not a website", brandDescription: "" } });
    expect(invalid.ok).toBe(false);
    expect(!invalid.ok && invalid.fieldErrors).toMatchObject({ brandWebsite: expect.stringMatching(/website or App Store link/), brandDescription: expect.any(String) });
    expect(await orgsOwnedBy(user.id)).toHaveLength(0);
    expect((await saveOnboardingStep({ step: "payment", answers: {} })).ok).toBe(false);
  });

  it("creates the workspace exactly once and updates its basics on later saves", async () => {
    const user = await makeUser();
    const { org: other } = await makeOrg();
    await signInAs(user.id);
    await saveThrough("referral");
    // A client-supplied org reference is ignored.
    const first = await saveOnboardingStep({ step: "brand", answers: { ...script[3][1], orgId: other.id } });
    expect(first.ok && first.data.org?.name).toBe("Juniper & Co.");
    const [org] = await orgsOwnedBy(user.id);
    expect(org).toMatchObject({ name: "Juniper & Co.", websiteUrl: "https://juniper.example", shortDescription: "Refillable home cleaning kits." });
    const db = await getDb();
    const [membership] = await db.select().from(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)));
    expect(membership.role).toBe("owner");
    expect((await draftOf(user.id)).orgId).toBe(org.id);

    const renamed = await saveOnboardingStep({
      step: "brand",
      answers: { brandName: "Juniper Home", brandWebsite: "https://apps.apple.com/us/app/juniper/id123", brandDescription: "Cleaning kits, refilled." },
    });
    expect(renamed.ok).toBe(true);
    const orgs = await orgsOwnedBy(user.id);
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({
      id: org.id,
      slug: org.slug,
      name: "Juniper Home",
      websiteUrl: null,
      appStoreUrl: "https://apps.apple.com/us/app/juniper/id123",
      shortDescription: "Cleaning kits, refilled.",
      version: org.version + 1,
    });
    const [untouched] = await db.select().from(organizations).where(eq(organizations.id, other.id));
    expect(untouched.name).toBe(other.name);
  });

  it("creates only one workspace when brand basics are saved concurrently", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    await saveThrough("referral");
    const results = await Promise.all([
      saveOnboardingStep({ step: "brand", answers: script[3][1] }),
      saveOnboardingStep({ step: "brand", answers: script[3][1] }),
    ]);
    expect(results.some((r) => r.ok)).toBe(true);
    for (const r of results) if (!r.ok) expect(r.code).toBe("conflict");
    expect(await orgsOwnedBy(user.id)).toHaveLength(1);
    // A retry after the race reuses the same workspace.
    expect((await saveOnboardingStep({ step: "brand", answers: script[3][1] })).ok).toBe(true);
    expect(await orgsOwnedBy(user.id)).toHaveLength(1);
  });

  it("clears an incompatible template on format change and blocks completion until a new one is chosen", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    await saveThrough("billing");
    const switched = await saveOnboardingStep({ step: "format", answers: { format: "slideshow" } });
    expect(switched.ok && switched.data.answers.templateId).toBeUndefined();
    expect(await loadOnboardingView(user.id, { startNew: false })).toMatchObject({ step: "template" });
    const blocked = await completeOnboarding({ deferPayment: true });
    expect(blocked).toMatchObject({ ok: false, error: "Complete “Template” before finishing." });
    expect((await saveOnboardingStep({ step: "template", answers: { templateId: "ugc-skit" } })).ok).toBe(false);
    expect((await saveOnboardingStep({ step: "template", answers: { templateId: "slideshow-listicle" } })).ok).toBe(true);
  });

  it("completes with an inactive campaign, a draft playbook and the chosen threshold — never activating or charging", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    await saveThrough("billing");
    const [org] = await orgsOwnedBy(user.id);
    expect((await completeOnboarding({ deferPayment: false })).ok).toBe(false);
    await markPaymentReady(org.id);

    const done = await completeOnboarding({ deferPayment: false });
    expect(done.ok).toBe(true);
    const db = await getDb();
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.orgId, org.id));
    expect(campaign).toMatchObject({
      name: "Juniper & Co. UGC",
      primaryHashtag: "juniperco",
      format: "ugc",
      status: "inactive",
      pricingMode: "daily",
      dailyBudgetCents: 150_00,
      activatedAt: null,
    });
    const [playbook] = await db.select().from(playbooks).where(eq(playbooks.orgId, org.id));
    expect(playbook).toMatchObject({ campaignId: campaign.id, format: "ugc", status: "draft", active: false, templateId: "ugc-hook-demo", publishedAt: null });
    expect(done.ok && done.data.redirectTo).toBe(`/home/${org.slug}/playbooks/${playbook.id}/edit`);

    const [updated] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(updated.billingThresholdCents).toBe(25_00);
    const draft = await draftOf(user.id);
    expect(draft.completedAt).not.toBeNull();
    expect(draft.deferredPaymentAt).toBeNull();
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "onboarding.complete"));
    expect(audit.data).toMatchObject({ role: "founder", referralSource: "code", referralCode: "SPRING26", deferredPayment: false });

    // Repeating the request is harmless and returns the same destination.
    const again = await completeOnboarding({ deferPayment: false });
    expect(again.ok && again.data.redirectTo).toBe(done.ok && done.data.redirectTo);
    expect(await db.select().from(campaigns).where(eq(campaigns.orgId, org.id))).toHaveLength(1);
    expect(await db.select().from(playbooks).where(eq(playbooks.orgId, org.id))).toHaveLength(1);
    expect(await loadOnboardingView(user.id, { startNew: false })).toEqual({ kind: "redirect", to: "/home" });
    expect((await saveOnboardingStep({ step: "role", answers: { role: "founder" } })).ok).toBe(false);
  });

  it("lets payment be deferred, still creating only inactive/draft records", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    await saveThrough("billing");
    const [org] = await orgsOwnedBy(user.id);
    const done = await completeOnboarding({ deferPayment: true });
    expect(done.ok).toBe(true);
    const draft = await draftOf(user.id);
    expect(draft.completedAt).not.toBeNull();
    expect(draft.deferredPaymentAt).not.toBeNull();
    const db = await getDb();
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.orgId, org.id));
    expect(campaign.status).toBe("inactive");
    const [playbook] = await db.select().from(playbooks).where(eq(playbooks.orgId, org.id));
    expect(playbook.status).toBe("draft");
    const [billing] = await db.select().from(billingAccounts).where(eq(billingAccounts.orgId, org.id));
    expect(billing.paymentMethodStatus).toBe("none");
  });

  it("makes the starter campaign hashtag unique across the platform", async () => {
    const { org: someoneElse } = await makeOrg();
    await makeCampaign(someoneElse.id, { primaryHashtag: "juniperco" });
    const user = await makeUser();
    await signInAs(user.id);
    await saveThrough("billing");
    expect((await completeOnboarding({ deferPayment: true })).ok).toBe(true);
    const [org] = await orgsOwnedBy(user.id);
    const db = await getDb();
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.orgId, org.id));
    expect(campaign.primaryHashtag).toBe("juniperco2");
  });

  it("starts a fresh draft for an additional workspace only when asked", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    await saveThrough("billing");
    await completeOnboarding({ deferPayment: true });

    expect(await loadOnboardingView(user.id, { startNew: true })).toMatchObject({ kind: "wizard", startNew: true, step: "role", answers: {}, org: null });
    expect(await saveOnboardingStep({ step: "role", answers: { role: "operations" } })).toMatchObject({ ok: false, code: "conflict" });

    await saveThrough("brand", { brand: { brandName: "Second Brand", brandWebsite: "second.example", brandDescription: "Another line." } }, true);
    const draft = await draftOf(user.id);
    expect(draft.completedAt).toBeNull();
    expect(draft.deferredPaymentAt).toBeNull();
    const orgs = await orgsOwnedBy(user.id);
    expect(orgs.map((o) => o.name).sort()).toEqual(["Juniper & Co.", "Second Brand"]);
    expect(draft.orgId).toBe(orgs.find((o) => o.name === "Second Brand")!.id);
  });

  it("retries a half-finished completion without creating a second campaign or playbook", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    await saveThrough("billing");
    const first = await completeOnboarding({ deferPayment: true });
    expect(first.ok).toBe(true);
    // Simulate a completion whose records were created but whose completion mark was rolled back.
    const db = await getDb();
    await db.update(onboardingDrafts).set({ completedAt: null, deferredPaymentAt: null }).where(eq(onboardingDrafts.userId, user.id));

    const retried = await completeOnboarding({ deferPayment: true });
    expect(retried.ok && retried.data.redirectTo).toBe(first.ok && first.data.redirectTo);
    const [org] = await orgsOwnedBy(user.id);
    expect(await db.select().from(campaigns).where(eq(campaigns.orgId, org.id))).toHaveLength(1);
    expect(await db.select().from(playbooks).where(eq(playbooks.orgId, org.id))).toHaveLength(1);
  });

  it("starts over (instead of looping back to /home) when a completed draft's workspace is no longer the user's", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    await saveThrough("billing");
    await completeOnboarding({ deferPayment: true });
    const [org] = await orgsOwnedBy(user.id);
    const db = await getDb();
    await db.delete(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)));

    expect(await loadOnboardingView(user.id, { startNew: false })).toMatchObject({ kind: "wizard", startNew: true, step: "role", answers: {} });
    expect((await saveOnboardingStep({ step: "role", answers: { role: "other" }, startNew: true })).ok).toBe(true);
    expect(await loadOnboardingView(user.id, { startNew: false })).toMatchObject({ kind: "wizard", step: "overview", answers: { role: "other" }, org: null });
  });

  it("sends existing workspace members to /home unless they ask for a new workspace", async () => {
    const { owner } = await makeOrg();
    expect(await loadOnboardingView(owner.id, { startNew: false })).toEqual({ kind: "redirect", to: "/home" });
    expect(await loadOnboardingView(owner.id, { startNew: true })).toMatchObject({ kind: "wizard", step: "role" });
  });

  it("requires owner permissions on the draft's workspace and hides workspaces the user left", async () => {
    const user = await makeUser();
    const otherOwner = await makeUser();
    await signInAs(user.id);
    await saveThrough("billing");
    const [org] = await orgsOwnedBy(user.id);
    const db = await getDb();

    // Demoted to member (primary ownership moved): completion is forbidden and creates nothing.
    await db.update(organizations).set({ primaryOwnerUserId: otherOwner.id }).where(eq(organizations.id, org.id));
    await db.update(memberships).set({ role: "member" }).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)));
    expect(await completeOnboarding({ deferPayment: true })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await beginPaymentSetup()).toMatchObject({ ok: false, code: "forbidden" });
    const view = await loadOnboardingView(user.id, { startNew: false });
    expect(view.kind === "wizard" && view.payment).toBeNull();

    // Removed from the workspace: it looks the same as a missing one.
    await db.delete(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)));
    expect(await completeOnboarding({ deferPayment: true })).toMatchObject({ ok: false, code: "not_found" });
    expect(await saveOnboardingStep({ step: "brand", answers: script[3][1] })).toMatchObject({ ok: false, code: "not_found" });
    expect(await db.select().from(campaigns).where(eq(campaigns.orgId, org.id))).toHaveLength(0);
  });

  it("reports payment setup and reach estimates honestly", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    expect(await beginPaymentSetup()).toMatchObject({ ok: false, code: "not_found" });
    await saveThrough("billing");
    const setup = await beginPaymentSetup();
    expect(setup.ok && setup.data.status).toBe("not_configured");
    const status = await checkPaymentStatus();
    expect(status.ok && status.data.status).toBe("none");
    const estimate = await estimateReach({ dailyBudgetCents: 1_000_00 });
    expect(estimate.ok && estimate.data.status).toBe("unavailable");
    expect((await estimateReach({ dailyBudgetCents: 10_00 })).ok).toBe(false);
  });
});
