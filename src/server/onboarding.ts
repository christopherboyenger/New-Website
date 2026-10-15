import "server-only";
import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { newId, randomString } from "@/lib/ids";
import { defaultTargeting } from "@/domain/campaign";
import { can } from "@/domain/permissions";
import { contentFormats, type ContentFormat } from "@/domain/playbook-content";
import {
  BUDGET_MAX_CENTS,
  BUDGET_MIN_CENTS,
  campaignNameFor,
  classifyBrandLink,
  DEFAULT_DAILY_BUDGET_CENTS,
  firstIncompleteStep,
  hashtagBaseFor,
  hashtagCandidate,
  isStepKey,
  laterStep,
  mergeStepAnswers,
  nextStepKey,
  onboardingStepKeys,
  parseAnswers,
  resumeStep,
  stepIndex,
  stepLabels,
  validateStep,
  type OnboardingAnswers,
  type OnboardingStepKey,
} from "@/domain/onboarding";
import { ConflictError, fail, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { getCurrentSession } from "./auth/session";
import { listUserOrganizations, NotFoundError, requireOrgAction, type OrgContext } from "./authz";
import { getPaymentReadiness, reconcilePaymentSetup, startPaymentMethodSetup, type PaymentReadiness, type PaymentSetupStart } from "./billing/payment-setup";
import { providerErrorSummary } from "./billing/provider";
import { createCampaign, getCampaign, HashtagTakenError, isHashtagAvailable } from "./campaigns-core";
import { getDb } from "./db/client";
import { emailOutbox, memberships, onboardingDrafts, onboardingOrgClaims, organizations } from "./db/schema";
import type { EmailDeliveryStatus } from "./email";
import { forecastReach, type Forecast } from "./forecast";
import { createOrganization, getOrganizationById } from "./organizations";
import { createPlaybookDraft, getPlaybook } from "./playbooks-core";

/**
 * Platform brand onboarding (server side). The draft lives in
 * `onboarding_drafts` (one row per user); the browser only ever sends the
 * answers of the screen being saved. Workspace, campaign and playbook IDs
 * are resolved from the stored draft, never from client input.
 */

export interface OnboardingOrg {
  slug: string;
  name: string;
}

export interface OnboardingWizardState {
  /** The next save replaces a completed draft (`/onboarding?new=1`). */
  startNew: boolean;
  step: OnboardingStepKey;
  answers: OnboardingAnswers;
  org: OnboardingOrg | null;
  /** Null until a workspace exists (or when the user may not view billing). */
  payment: PaymentReadiness | null;
  forecast: Forecast;
}

export type OnboardingView = { kind: "redirect"; to: string } | ({ kind: "wizard" } & OnboardingWizardState);

export interface SavedStep {
  step: OnboardingStepKey;
  answers: OnboardingAnswers;
  org: OnboardingOrg | null;
  payment: PaymentReadiness | null;
}

interface DraftData {
  /** Identifies this draft instance; one workspace may be created per instance. */
  draftId: string;
  answers: OnboardingAnswers;
  /** Starter records created at completion (kept so a retried completion reuses them). */
  result: { campaignId?: string; playbookId?: string };
}

type DraftRow = typeof onboardingDrafts.$inferSelect;

const SIGNED_OUT_MESSAGE = "Your session has ended. Sign in again to continue.";
const ORG_CLAIM_STALE_MS = 2 * 60 * 1000;

/* ----------------------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------------------- */

const draftDataShape = z.object({
  draftId: z.string().min(1).optional().catch(undefined),
  answers: z.unknown(),
  result: z
    .object({ campaignId: z.string().optional().catch(undefined), playbookId: z.string().optional().catch(undefined) })
    .catch({}),
});

function parseDraftData(userId: string, raw: unknown): DraftData {
  const parsed = draftDataShape.safeParse(raw ?? {});
  const data = parsed.success ? parsed.data : { draftId: undefined, answers: {}, result: {} };
  return {
    draftId: data.draftId ?? `obd_legacy_${userId}`,
    answers: parseAnswers(data.answers),
    result: data.result ?? {},
  };
}

async function readDraft(userId: string): Promise<{ row: DraftRow; data: DraftData } | null> {
  const db = await getDb();
  const [row] = await db.select().from(onboardingDrafts).where(eq(onboardingDrafts.userId, userId)).limit(1);
  return row ? { row, data: parseDraftData(userId, row.data) } : null;
}

/** The draft's workspace as seen by this user (null if it is gone or they are no longer a member). */
async function draftOrgSummary(userId: string, orgId: string | null): Promise<{ org: OnboardingOrg | null; payment: PaymentReadiness | null }> {
  if (!orgId) return { org: null, payment: null };
  const db = await getDb();
  const [row] = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name, primaryOwnerUserId: organizations.primaryOwnerUserId, role: memberships.role })
    .from(organizations)
    .innerJoin(memberships, and(eq(memberships.orgId, organizations.id), eq(memberships.userId, userId)))
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) return { org: null, payment: null };
  const canViewBilling = can({ role: row.role, isPrimaryOwner: row.primaryOwnerUserId === userId }, "billing:view");
  return { org: { slug: row.slug, name: row.name }, payment: canViewBilling ? await getPaymentReadiness(row.id) : null };
}

function forecastFor(dailyBudgetCents: number, format: ContentFormat | undefined): Promise<Forecast> {
  // The budget screen comes before the format screen; until a format is saved the
  // estimate is requested for the first listed format (docs/decisions/onboarding.md).
  return forecastReach({ dailyBudgetCents, format: format ?? contentFormats[0], targeting: defaultTargeting });
}

/**
 * What `/onboarding` shows for this user: the wizard (resumed at the saved
 * screen) or a redirect when onboarding is already done.
 */
export async function loadOnboardingView(userId: string, opts: { startNew: boolean }): Promise<OnboardingView> {
  const draft = await readDraft(userId);
  if (draft && !draft.row.completedAt) {
    const answers = draft.data.answers;
    const step = resumeStep(isStepKey(draft.row.stepKey) ? draft.row.stepKey : null, answers);
    const { org, payment } = await draftOrgSummary(userId, draft.row.orgId);
    const forecast = await forecastFor(answers.dailyBudgetCents ?? DEFAULT_DAILY_BUDGET_CENTS, answers.format);
    return { kind: "wizard", startNew: false, step, answers, org, payment, forecast };
  }
  // Members of a workspace go home. A completed draft whose workspace the user no
  // longer belongs to starts over (redirecting would loop: /home sends users
  // without a workspace back here).
  if (!opts.startNew && (await listUserOrganizations(userId)).length > 0) return { kind: "redirect", to: "/home" };
  const forecast = await forecastFor(DEFAULT_DAILY_BUDGET_CENTS, undefined);
  const startNew = opts.startNew || Boolean(draft?.row.completedAt);
  return { kind: "wizard", startNew, step: "role", answers: {}, org: null, payment: null, forecast };
}

export interface VerificationDelivery {
  status: EmailDeliveryStatus | "queued";
  at: Date;
}

/** Real delivery state of the most recent verification email to this address (from the outbox). */
export async function latestVerificationDelivery(email: string): Promise<VerificationDelivery | null> {
  const db = await getDb();
  const [row] = await db
    .select({ status: emailOutbox.status, at: emailOutbox.createdAt })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.toEmail, email), eq(emailOutbox.template, "verify_email")))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  return row ?? null;
}

/* ----------------------------------------------------------------------------
 * Save a screen
 * ------------------------------------------------------------------------- */

const saveInputSchema = z.object({
  step: z.enum(onboardingStepKeys),
  answers: z.record(z.string(), z.unknown()).default({}),
  startNew: z.boolean().default(false),
});

/**
 * Validates and persists one screen, then returns the screen to show next.
 * Earlier screens must already be complete. Saving brand basics creates the
 * workspace exactly once per draft and afterwards updates its basics.
 */
export async function saveOnboardingStep(raw: unknown): Promise<ActionResult<SavedStep>> {
  return runAction(async () => {
    const current = await getCurrentSession();
    if (!current) return fail(SIGNED_OUT_MESSAGE, "forbidden");
    const parsed = saveInputSchema.safeParse(raw);
    if (!parsed.success) return fail("That step could not be saved. Reload the page and try again.");
    const { step, startNew } = parsed.data;
    if (step === "payment") return fail("Use Add payment method, Finish or I’ll finish later on this step.");

    const userId = current.user.id;
    const existing = await readDraft(userId);
    let mode: "insert" | "update" | "reset";
    if (!existing) mode = "insert";
    else if (!existing.row.completedAt) mode = "update";
    else if (startNew) mode = "reset";
    else return fail("Setup is already complete for this workspace.", "conflict");

    const keep = mode === "update" ? existing : null;
    const base: DraftData = keep?.data ?? { draftId: newId("obd"), answers: {}, result: {} };
    const answers = mergeStepAnswers(base.answers, step, parsed.data.answers);

    const blocking = firstIncompleteStep(answers);
    if (stepIndex(blocking) < stepIndex(step)) {
      return fail(`Complete “${stepLabels[blocking]}” first.`, "validation");
    }
    const check = validateStep(step, answers);
    if (!check.valid) return { ok: false, error: check.reason ?? "Check the highlighted fields.", code: "validation", fieldErrors: check.fieldErrors };
    const saved: OnboardingAnswers = { ...answers, ...check.values };

    let orgId = keep?.row.orgId ?? null;
    if (step === "brand") orgId = await saveBrandOrganization(userId, base.draftId, orgId, saved);

    const reached = keep && isStepKey(keep.row.stepKey) ? laterStep(keep.row.stepKey, nextStepKey(step)) : nextStepKey(step);
    const data: DraftData = { draftId: base.draftId, answers: saved, result: base.result };
    const written = await writeDraft(userId, mode, { stepKey: reached, data, orgId });
    if (!written) throw new ConflictError("Your setup changed in another tab. Reload the page to continue.");

    const { org, payment } = await draftOrgSummary(userId, orgId);
    return ok({ step: nextStepKey(step), answers: saved, org, payment });
  });
}

async function writeDraft(userId: string, mode: "insert" | "update" | "reset", values: { stepKey: OnboardingStepKey; data: DraftData; orgId: string | null }): Promise<boolean> {
  const db = await getDb();
  const now = new Date();
  const data = values.data as unknown as Record<string, unknown>;
  if (mode === "insert") {
    const rows = await db
      .insert(onboardingDrafts)
      .values({ userId, stepKey: values.stepKey, data, orgId: values.orgId, updatedAt: now })
      .onConflictDoNothing()
      .returning({ userId: onboardingDrafts.userId });
    return rows.length > 0;
  }
  const rows = await db
    .update(onboardingDrafts)
    .set({ stepKey: values.stepKey, data, orgId: values.orgId, updatedAt: now, completedAt: null, deferredPaymentAt: null })
    .where(and(eq(onboardingDrafts.userId, userId), mode === "reset" ? isNotNull(onboardingDrafts.completedAt) : isNull(onboardingDrafts.completedAt)))
    .returning({ userId: onboardingDrafts.userId });
  return rows.length > 0;
}

/** Creates the draft's workspace once, or updates its name/links/description on later saves. */
async function saveBrandOrganization(userId: string, draftId: string, orgId: string | null, answers: OnboardingAnswers): Promise<string> {
  const brand = { name: answers.brandName ?? "", website: answers.brandWebsite ?? "", description: answers.brandDescription ?? "" };
  const db = await getDb();
  let targetId = orgId;
  if (!targetId) {
    const claim = await claimWorkspaceCreation(userId, draftId);
    if (claim.kind === "existing") {
      targetId = claim.orgId;
    } else {
      try {
        const org = await createOrganization(userId, brand);
        await db.update(onboardingOrgClaims).set({ orgId: org.id }).where(eq(onboardingOrgClaims.draftId, draftId));
        return org.id;
      } catch (error) {
        await db.delete(onboardingOrgClaims).where(and(eq(onboardingOrgClaims.draftId, draftId), isNull(onboardingOrgClaims.orgId)));
        throw error;
      }
    }
  }

  const org = await getOrganizationById(targetId);
  if (!org) throw new NotFoundError("Workspace not found.");
  const ctx = await requireOrgAction(org.slug, "branding:edit");
  const links = classifyBrandLink(brand.website);
  const unchanged =
    ctx.org.name === brand.name &&
    ctx.org.shortDescription === brand.description &&
    ctx.org.websiteUrl === links.websiteUrl &&
    ctx.org.appStoreUrl === links.appStoreUrl &&
    ctx.org.playStoreUrl === links.playStoreUrl;
  if (!unchanged) {
    await db
      .update(organizations)
      .set({ name: brand.name, ...links, shortDescription: brand.description, updatedAt: new Date(), version: sql`${organizations.version} + 1` })
      .where(eq(organizations.id, ctx.org.id));
    await recordAudit({ orgId: ctx.org.id, actorUserId: userId, action: "organization.update_basics", targetType: "organization", targetId: ctx.org.id });
  }
  return ctx.org.id;
}

async function claimWorkspaceCreation(userId: string, draftId: string): Promise<{ kind: "claimed" } | { kind: "existing"; orgId: string }> {
  const db = await getDb();
  const inserted = await db.insert(onboardingOrgClaims).values({ draftId, userId }).onConflictDoNothing().returning({ draftId: onboardingOrgClaims.draftId });
  if (inserted.length) return { kind: "claimed" };
  const [claim] = await db
    .select()
    .from(onboardingOrgClaims)
    .where(and(eq(onboardingOrgClaims.draftId, draftId), eq(onboardingOrgClaims.userId, userId)))
    .limit(1);
  if (claim?.orgId) return { kind: "existing", orgId: claim.orgId };
  if (claim) {
    // A creation that never finished (e.g. a crashed request) can be taken over after a short while.
    const takenOver = await db
      .update(onboardingOrgClaims)
      .set({ claimedAt: new Date() })
      .where(
        and(
          eq(onboardingOrgClaims.draftId, draftId),
          isNull(onboardingOrgClaims.orgId),
          lt(onboardingOrgClaims.claimedAt, new Date(Date.now() - ORG_CLAIM_STALE_MS)),
        ),
      )
      .returning({ draftId: onboardingOrgClaims.draftId });
    if (takenOver.length) return { kind: "claimed" };
  }
  throw new ConflictError("Your workspace is still being created. Try again in a moment.");
}

/* ----------------------------------------------------------------------------
 * Budget estimate
 * ------------------------------------------------------------------------- */

const estimateSchema = z.object({
  dailyBudgetCents: z.number().int().min(BUDGET_MIN_CENTS).max(BUDGET_MAX_CENTS),
});

/** Reach estimate for a budget. Comes only from the forecast service (currently always unavailable). */
export async function estimateReach(raw: unknown): Promise<ActionResult<Forecast>> {
  return runAction(async () => {
    const current = await getCurrentSession();
    if (!current) return fail(SIGNED_OUT_MESSAGE, "forbidden");
    const parsed = estimateSchema.safeParse(raw);
    if (!parsed.success) return fail("Choose a valid daily budget to see an estimate.");
    const draft = await readDraft(current.user.id);
    return ok(await forecastFor(parsed.data.dailyBudgetCents, draft?.data.answers.format));
  });
}

/* ----------------------------------------------------------------------------
 * Payment step
 * ------------------------------------------------------------------------- */

/** The in-progress draft's workspace, once every screen before payment is complete. */
async function paymentStepContext(userId: string, permission: "billing:manage" | "billing:view"): Promise<OrgContext> {
  const draft = await readDraft(userId);
  if (!draft || draft.row.completedAt || !draft.row.orgId) throw new NotFoundError("There is no setup in progress.");
  const blocking = firstIncompleteStep(draft.data.answers);
  if (blocking !== "payment") throw new ConflictError(`Complete “${stepLabels[blocking]}” first.`);
  const org = await getOrganizationById(draft.row.orgId);
  if (!org) throw new NotFoundError("Workspace not found.");
  return requireOrgAction(org.slug, permission);
}

/**
 * Starts provider-hosted card setup for the draft's workspace. The result is
 * reported as-is: a redirect to the provider, "not configured", or an error.
 * Nothing is charged here.
 */
export async function beginPaymentSetup(): Promise<ActionResult<PaymentSetupStart>> {
  return runAction(async () => {
    const current = await getCurrentSession();
    if (!current) return fail(SIGNED_OUT_MESSAGE, "forbidden");
    const ctx = await paymentStepContext(current.user.id, "billing:manage");
    const readiness = await getPaymentReadiness(ctx.org.id);
    if (readiness.status === "ready") return fail("A payment method is already on file. Choose Finish to continue.", "conflict");
    if (readiness.status === "pending") return fail("Your payment method is still being confirmed. Check again in a moment.", "conflict");
    return ok(await startPaymentMethodSetup(ctx, { returnPath: "/onboarding" }));
  });
}

/**
 * Payment state after the provider return or "Check again": asks the provider
 * for the latest card-setup outcome (the same effect a webhook has) and falls
 * back to the stored provider-confirmed state if the provider can't be
 * reached. Never inferred from the browser redirect itself.
 */
export async function checkPaymentStatus(): Promise<ActionResult<PaymentReadiness>> {
  return runAction(async () => {
    const current = await getCurrentSession();
    if (!current) return fail(SIGNED_OUT_MESSAGE, "forbidden");
    const ctx = await paymentStepContext(current.user.id, "billing:view");
    try {
      return ok(await reconcilePaymentSetup(ctx));
    } catch (error) {
      console.error("[onboarding] payment reconcile failed; using stored state:", providerErrorSummary(error));
      return ok(await getPaymentReadiness(ctx.org.id));
    }
  });
}

/* ----------------------------------------------------------------------------
 * Completion
 * ------------------------------------------------------------------------- */

const completeSchema = z.object({ deferPayment: z.boolean() });

/**
 * Finishes onboarding: creates an INACTIVE campaign and a DRAFT playbook from
 * the chosen template, stores the billing threshold on the workspace and
 * marks the draft complete (and payment deferred, for "I'll finish later").
 * Never activates, publishes or charges. Returns the playbook editor path.
 */
export async function completeOnboarding(raw: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const current = await getCurrentSession();
    if (!current) return fail(SIGNED_OUT_MESSAGE, "forbidden");
    const parsed = completeSchema.safeParse(raw);
    if (!parsed.success) return fail("That request could not be processed.");
    const { deferPayment } = parsed.data;
    const userId = current.user.id;

    const draft = await readDraft(userId);
    if (!draft) return fail("There is no setup in progress.", "not_found");
    if (draft.row.completedAt) return ok({ redirectTo: await completedDestination(userId, draft) });
    const answers = draft.data.answers;
    const blocking = firstIncompleteStep(answers);
    if (blocking !== "payment") return fail(`Complete “${stepLabels[blocking]}” before finishing.`);
    if (!draft.row.orgId) return fail("Save your brand details before finishing.");

    const org = await getOrganizationById(draft.row.orgId);
    if (!org) throw new NotFoundError("Workspace not found.");
    const ctx = await requireOrgAction(org.slug, "campaign:manage");
    await requireOrgAction(org.slug, "billing:manage");
    if (!deferPayment && (await getPaymentReadiness(ctx.org.id)).status !== "ready") {
      return fail("Add a payment method before finishing, or choose “I’ll finish later”.");
    }

    // Claim completion atomically so a double submit cannot create two campaigns.
    const db = await getDb();
    const now = new Date();
    const claimed = await db
      .update(onboardingDrafts)
      .set({ completedAt: now, deferredPaymentAt: deferPayment ? now : null, updatedAt: now })
      .where(and(eq(onboardingDrafts.userId, userId), isNull(onboardingDrafts.completedAt), eq(onboardingDrafts.orgId, ctx.org.id)))
      .returning({ userId: onboardingDrafts.userId });
    if (!claimed.length) {
      const latest = await readDraft(userId);
      if (latest?.row.completedAt) return ok({ redirectTo: await completedDestination(userId, latest) });
      throw new ConflictError("Your setup changed in another tab. Reload the page to continue.");
    }

    try {
      const playbookId = await createStarterContent(ctx, userId, draft.data, deferPayment);
      return ok({ redirectTo: editorPath(ctx.org.slug, playbookId) });
    } catch (error) {
      await db.update(onboardingDrafts).set({ completedAt: null, deferredPaymentAt: null }).where(eq(onboardingDrafts.userId, userId));
      throw error;
    }
  });
}

async function createStarterContent(ctx: OrgContext, userId: string, data: DraftData, deferPayment: boolean): Promise<string> {
  const answers = data.answers;
  const format = answers.format as ContentFormat;
  const db = await getDb();
  const persistResult = (result: DraftData["result"]) =>
    db
      .update(onboardingDrafts)
      .set({ data: { ...data, result } as unknown as Record<string, unknown> })
      .where(eq(onboardingDrafts.userId, userId));

  let campaignId = data.result.campaignId ?? null;
  if (!campaignId || !(await getCampaign(ctx.org.id, campaignId))) {
    const campaign = await createCampaignWithUniqueHashtag(ctx, {
      name: campaignNameFor(answers.brandName ?? ctx.org.name, format),
      brandName: answers.brandName ?? ctx.org.name,
      format,
      dailyBudgetCents: answers.dailyBudgetCents as number,
    });
    campaignId = campaign.id;
    await persistResult({ campaignId });
  }

  const existingPlaybook = data.result.playbookId ? await getPlaybook(ctx.org.id, data.result.playbookId) : null;
  const playbook =
    existingPlaybook && existingPlaybook.campaignId === campaignId
      ? existingPlaybook
      : await createPlaybookDraft(ctx, { campaignId, templateId: answers.templateId ?? null });
  await persistResult({ campaignId, playbookId: playbook.id });
  await db
    .update(organizations)
    .set({ billingThresholdCents: answers.billingThresholdCents as number, updatedAt: new Date(), version: sql`${organizations.version} + 1` })
    .where(eq(organizations.id, ctx.org.id));
  await recordAudit({
    orgId: ctx.org.id,
    actorUserId: userId,
    action: "onboarding.complete",
    targetType: "playbook",
    targetId: playbook.id,
    data: {
      campaignId,
      deferredPayment: deferPayment,
      role: answers.role ?? null,
      referralSource: answers.referralSource ?? null,
      referralCode: answers.referralCode ?? null,
      referralDetail: answers.referralDetail ?? null,
    },
  });
  return playbook.id;
}

/** Campaign hashtags are platform-unique (DEC-010): try stem, stem2, stem3, … then a random suffix. */
async function createCampaignWithUniqueHashtag(
  ctx: OrgContext,
  input: { name: string; brandName: string; format: ContentFormat; dailyBudgetCents: number },
) {
  const base = hashtagBaseFor(input.brandName);
  const create = (primaryHashtag: string) =>
    createCampaign(ctx, { name: input.name, primaryHashtag, format: input.format, dailyBudgetCents: input.dailyBudgetCents });
  for (let attempt = 0; attempt < 25; attempt++) {
    const tag = hashtagCandidate(base, attempt);
    if (!(await isHashtagAvailable(tag))) continue;
    try {
      return await create(tag);
    } catch (error) {
      if (!(error instanceof HashtagTakenError)) throw error;
    }
  }
  return create(`${base}${randomString(6)}`);
}

function editorPath(slug: string, playbookId: string): string {
  return `/home/${slug}/playbooks/${playbookId}/edit`;
}

async function completedDestination(userId: string, draft: { row: DraftRow; data: DraftData }): Promise<string> {
  const playbookId = draft.data.result.playbookId;
  if (!playbookId || !draft.row.orgId) return "/home";
  const { org } = await draftOrgSummary(userId, draft.row.orgId);
  return org ? editorPath(org.slug, playbookId) : "/home";
}
