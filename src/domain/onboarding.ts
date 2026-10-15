/**
 * Platform brand onboarding: the step machine, answer vocabulary and
 * per-step validation shared by the wizard UI and the server commands.
 *
 * Screen order follows the reference capture map (A04–B07) with reference
 * position 5 omitted because it was never observed (DEC-014); progress
 * counts implemented screens only. Labels marked "observed" come from the
 * captures; everything else is a recorded product decision
 * (docs/decisions/onboarding.md).
 */
import { z } from "zod";
import { commercialPolicy } from "@/config/commercial-policy";
import { MIN_DAILY_BUDGET_CENTS } from "./campaign";
import { contentFormatLabels, contentFormats, type ContentFormat } from "./playbook-content";
import { findTemplate } from "./playbook-templates";

/* ----------------------------------------------------------------------------
 * Steps
 * ------------------------------------------------------------------------- */

export const onboardingStepKeys = ["role", "overview", "referral", "brand", "budget", "summary", "format", "template", "billing", "payment"] as const;
export type OnboardingStepKey = (typeof onboardingStepKeys)[number];

/** Position of each implemented screen in the 11-position reference progress bar (evidence map only). */
export const referencePositions: Record<OnboardingStepKey, number> = {
  role: 1,
  overview: 2,
  referral: 3,
  brand: 4,
  budget: 6,
  summary: 7,
  format: 8,
  template: 9,
  billing: 10,
  payment: 11,
};

/** Short names used in progress announcements and "complete … first" messages. */
export const stepLabels: Record<OnboardingStepKey, string> = {
  role: "About you",
  overview: "Overview",
  referral: "How you heard about us",
  brand: "Brand basics",
  budget: "Daily budget",
  summary: "Your plan",
  format: "Content format",
  template: "Template",
  billing: "Billing threshold",
  payment: "Payment",
};

export const TOTAL_STEPS = onboardingStepKeys.length;

export function isStepKey(value: unknown): value is OnboardingStepKey {
  return typeof value === "string" && (onboardingStepKeys as readonly string[]).includes(value);
}

export function stepIndex(step: OnboardingStepKey): number {
  return onboardingStepKeys.indexOf(step);
}

/** 1-based number shown as "Step X of Y". */
export function stepNumber(step: OnboardingStepKey): number {
  return stepIndex(step) + 1;
}

export function nextStepKey(step: OnboardingStepKey): OnboardingStepKey {
  return onboardingStepKeys[Math.min(stepIndex(step) + 1, TOTAL_STEPS - 1)];
}

export function previousStepKey(step: OnboardingStepKey): OnboardingStepKey | null {
  const i = stepIndex(step);
  return i > 0 ? onboardingStepKeys[i - 1] : null;
}

export function laterStep(a: OnboardingStepKey, b: OnboardingStepKey): OnboardingStepKey {
  return stepIndex(a) >= stepIndex(b) ? a : b;
}

/* ----------------------------------------------------------------------------
 * Vocabularies
 * ------------------------------------------------------------------------- */

/** Observed role labels (A04). The two obscured labels are not invented (DEC-014). */
export const roleKeys = ["founder", "creator", "operations", "other"] as const;
export type OnboardingRole = (typeof roleKeys)[number];
export const roleLabels: Record<OnboardingRole, string> = {
  founder: "Founder",
  creator: "Creator",
  operations: "Operations",
  other: "Other",
};

/** Observed referral labels, in captured order (A08). */
export const referralKeys = ["google_search", "social_media", "podcast", "youtube", "tiktok", "code", "other"] as const;
export type ReferralSource = (typeof referralKeys)[number];
export const referralLabels: Record<ReferralSource, string> = {
  google_search: "Google Search",
  social_media: "Social Media",
  podcast: "Podcast",
  youtube: "YouTube",
  tiktok: "TikTok",
  code: "I have a code",
  other: "Other",
};

/** Observed format descriptions (B04). */
export const formatDescriptions: Record<ContentFormat, string> = {
  slideshow: "The fastest way to reach viewers, and the best way to test new formats.",
  ugc: "Creators show faces on camera to promote your brand.",
};

/** Observed threshold card descriptions (B06), keyed by cents. */
const thresholdDescriptions: Record<number, string> = {
  10_00: "Get charged in small, frequent amounts",
  25_00: "A balanced cadence for most brands",
  50_00: "Fewer, larger charges. Less paperwork",
};

export interface ThresholdOption {
  cents: number;
  description: string;
}

/** Only thresholds the commercial policy implements are offered. */
export function billingThresholdOptions(): ThresholdOption[] {
  return commercialPolicy.billingThresholdOptionsCents.map((cents) => ({ cents, description: thresholdDescriptions[cents] ?? "" }));
}

/* ----------------------------------------------------------------------------
 * Limits (proposed; see docs/decisions/onboarding.md)
 * ------------------------------------------------------------------------- */

export const BRAND_NAME_MAX = 80;
export const BRAND_WEBSITE_MAX = 300;
export const BRAND_DESCRIPTION_MAX = 500;
export const REFERRAL_CODE_MAX = 40;
export const REFERRAL_DETAIL_MAX = 120;

/** Daily budget is a whole-dollar daily average target; the documented minimum is $50. */
export const BUDGET_MIN_CENTS = MIN_DAILY_BUDGET_CENTS;
export const BUDGET_MAX_CENTS = 5_000_00;
export const BUDGET_SLIDER_STEP_CENTS = 10_00;
export const DEFAULT_DAILY_BUDGET_CENTS = BUDGET_MIN_CENTS;

/* ----------------------------------------------------------------------------
 * Answers
 * ------------------------------------------------------------------------- */

export interface OnboardingAnswers {
  role?: OnboardingRole;
  referralSource?: ReferralSource;
  referralCode?: string;
  referralDetail?: string;
  brandName?: string;
  brandWebsite?: string;
  brandDescription?: string;
  dailyBudgetCents?: number;
  format?: ContentFormat;
  templateId?: string;
  billingThresholdCents?: number;
}

export type AnswerKey = keyof OnboardingAnswers;

/** Which answers each screen owns. Screens without inputs own nothing. */
export const stepFields: Record<OnboardingStepKey, readonly AnswerKey[]> = {
  role: ["role"],
  overview: [],
  referral: ["referralSource", "referralCode", "referralDetail"],
  brand: ["brandName", "brandWebsite", "brandDescription"],
  budget: ["dailyBudgetCents"],
  summary: [],
  format: ["format"],
  template: ["templateId"],
  billing: ["billingThresholdCents"],
  payment: [],
};

const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

/**
 * Lenient shape for stored or client-supplied answers: unknown keys are
 * dropped and malformed values become "unanswered" instead of failing.
 */
const answersShape = z.object({
  role: lenient(z.enum(roleKeys)),
  referralSource: lenient(z.enum(referralKeys)),
  referralCode: lenient(z.string().max(200)),
  referralDetail: lenient(z.string().max(500)),
  brandName: lenient(z.string().max(500)),
  brandWebsite: lenient(z.string().max(1000)),
  brandDescription: lenient(z.string().max(2000)),
  dailyBudgetCents: lenient(z.number().int().safe()),
  format: lenient(z.enum(contentFormats)),
  templateId: lenient(z.string().max(100)),
  billingThresholdCents: lenient(z.number().int().safe()),
});

export function parseAnswers(raw: unknown): OnboardingAnswers {
  const parsed = answersShape.safeParse(raw ?? {});
  return parsed.success ? compact(parsed.data) : {};
}

/** Only the answers a given screen owns, from untrusted input. */
export function pickStepAnswers(step: OnboardingStepKey, raw: unknown): OnboardingAnswers {
  const all = parseAnswers(raw);
  const out: Record<string, unknown> = {};
  for (const key of stepFields[step]) if (all[key] !== undefined) out[key] = all[key];
  return out as OnboardingAnswers;
}

/** Defaults shown before the user answers; never treated as saved answers. */
export function withDisplayDefaults(answers: OnboardingAnswers): OnboardingAnswers {
  return {
    ...answers,
    dailyBudgetCents: answers.dailyBudgetCents ?? DEFAULT_DAILY_BUDGET_CENTS,
    billingThresholdCents: answers.billingThresholdCents ?? commercialPolicy.defaultBillingThresholdCents,
  };
}

/**
 * Keeps a template only while it matches the chosen format. A format change
 * never converts a template (DEC-009); an incompatible choice is cleared so
 * the user must pick again.
 */
export function reconcileAnswers(answers: OnboardingAnswers): OnboardingAnswers {
  const out = { ...answers };
  if (out.templateId) {
    const template = findTemplate(out.templateId);
    if (!template || !out.format || template.format !== out.format) delete out.templateId;
  }
  if (out.referralSource !== "code") delete out.referralCode;
  if (out.referralSource !== "other") delete out.referralDetail;
  return compact(out);
}

/** Replaces the answers a screen owns with `submitted` (unsubmitted fields of that screen are cleared). */
export function mergeStepAnswers(base: OnboardingAnswers, step: OnboardingStepKey, submitted: unknown): OnboardingAnswers {
  const out: Record<string, unknown> = { ...base };
  for (const key of stepFields[step]) delete out[key];
  return reconcileAnswers({ ...(out as OnboardingAnswers), ...pickStepAnswers(step, submitted) });
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== "")) as T;
}

/* ----------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

/** Accepts "yourbrand.com", full http(s) URLs and App Store / Play links. */
export function isWebsiteOrStoreLink(value: string): boolean {
  if (/\s/.test(value)) return false;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

const roleSchema = z.object({
  role: z.enum(roleKeys, { error: "Choose the option that best describes you." }),
});

const referralSchema = z
  .object({
    referralSource: z.enum(referralKeys, { error: "Choose where you heard about us." }),
    referralCode: z.string().trim().max(REFERRAL_CODE_MAX, `Use ${REFERRAL_CODE_MAX} characters or fewer.`).optional(),
    referralDetail: z.string().trim().max(REFERRAL_DETAIL_MAX, `Use ${REFERRAL_DETAIL_MAX} characters or fewer.`).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.referralSource === "code" && !value.referralCode) {
      ctx.addIssue({ code: "custom", path: ["referralCode"], message: "Enter your code to continue." });
    }
    if (value.referralCode && !/^[A-Za-z0-9_-]+$/.test(value.referralCode)) {
      ctx.addIssue({ code: "custom", path: ["referralCode"], message: "Use letters, numbers, dashes or underscores." });
    }
  })
  .transform((value) => ({
    referralSource: value.referralSource,
    referralCode: value.referralSource === "code" ? value.referralCode : undefined,
    referralDetail: value.referralSource === "other" ? value.referralDetail || undefined : undefined,
  }));

const brandSchema = z.object({
  brandName: z
    .string({ error: "Enter your brand name." })
    .trim()
    .min(1, "Enter your brand name.")
    .max(BRAND_NAME_MAX, `Use ${BRAND_NAME_MAX} characters or fewer.`),
  brandWebsite: z
    .string({ error: "Enter your website or an App Store link." })
    .trim()
    .min(1, "Enter your website or an App Store link.")
    .max(BRAND_WEBSITE_MAX, `Use ${BRAND_WEBSITE_MAX} characters or fewer.`)
    .refine(isWebsiteOrStoreLink, "Enter a website or App Store link, e.g. yourbrand.com."),
  brandDescription: z
    .string({ error: "Add a short description of your brand." })
    .trim()
    .min(1, "Add a short description of your brand.")
    .max(BRAND_DESCRIPTION_MAX, `Keep the description under ${BRAND_DESCRIPTION_MAX} characters.`),
});

const budgetMessage = `Choose a daily budget between ${dollars(BUDGET_MIN_CENTS)} and ${dollars(BUDGET_MAX_CENTS)}.`;
const budgetSchema = z.object({
  dailyBudgetCents: z
    .number({ error: budgetMessage })
    .int(budgetMessage)
    .min(BUDGET_MIN_CENTS, budgetMessage)
    .max(BUDGET_MAX_CENTS, budgetMessage)
    .refine((cents) => cents % 100 === 0, "Use a whole-dollar amount."),
});

const formatSchema = z.object({
  format: z.enum(contentFormats, { error: "Choose a content format." }),
});

const billingSchema = z.object({
  billingThresholdCents: z
    .number({ error: "Choose how often you want to be charged." })
    .refine((cents) => (commercialPolicy.billingThresholdOptionsCents as readonly number[]).includes(cents), "Choose how often you want to be charged."),
});

export interface StepValidation {
  valid: boolean;
  /** Messages keyed by OnboardingAnswers field. */
  fieldErrors: Record<string, string>;
  /** Why Next is unavailable, shown beside it; null when valid. */
  reason: string | null;
  /** Normalized answers for this screen when valid (trimmed, irrelevant fields dropped). */
  values: OnboardingAnswers;
}

const validResult = (values: OnboardingAnswers = {}): StepValidation => ({ valid: true, fieldErrors: {}, reason: null, values });

function fromSchema(schema: z.ZodType<OnboardingAnswers>, input: OnboardingAnswers): StepValidation {
  const parsed = schema.safeParse(input);
  if (parsed.success) return validResult(compact(parsed.data));
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const reason = parsed.error.issues[0]?.message ?? "Complete this step to continue.";
  return { valid: false, fieldErrors, reason, values: {} };
}

/** Validates one screen against the full answer set (the template screen depends on the chosen format). */
export function validateStep(step: OnboardingStepKey, answers: OnboardingAnswers): StepValidation {
  switch (step) {
    case "role":
      return fromSchema(roleSchema, answers);
    case "referral":
      return fromSchema(referralSchema, answers);
    case "brand": {
      const result = fromSchema(brandSchema, answers);
      if (!result.valid && Object.keys(result.fieldErrors).length > 1) {
        return { ...result, reason: "Complete your brand name, website and description to continue." };
      }
      return result;
    }
    case "budget":
      return fromSchema(budgetSchema, answers);
    case "format":
      return fromSchema(formatSchema, answers);
    case "template": {
      const template = findTemplate(answers.templateId);
      if (!answers.format) return invalid("templateId", "Choose a content format first.");
      if (!template || template.format !== answers.format) return invalid("templateId", "Choose a template to continue.");
      return validResult({ templateId: template.id });
    }
    case "billing":
      return fromSchema(billingSchema, answers);
    case "overview":
    case "summary":
    case "payment":
      return validResult();
  }
}

function invalid(field: AnswerKey, message: string): StepValidation {
  return { valid: false, fieldErrors: { [field]: message }, reason: message, values: {} };
}

/** The first screen whose answers are missing or invalid (`payment` when everything before it is complete). */
export function firstIncompleteStep(answers: OnboardingAnswers): OnboardingStepKey {
  for (const step of onboardingStepKeys) {
    if (!validateStep(step, answers).valid) return step;
  }
  return "payment";
}

/**
 * Where a returning user resumes: the furthest screen they reached, but never
 * past a screen whose saved answers are incomplete.
 */
export function resumeStep(reached: OnboardingStepKey | null, answers: OnboardingAnswers): OnboardingStepKey {
  if (!reached) return "role";
  const blocking = firstIncompleteStep(answers);
  return stepIndex(reached) <= stepIndex(blocking) ? reached : blocking;
}

/* ----------------------------------------------------------------------------
 * Derived values for completion
 * ------------------------------------------------------------------------- */

/** "<Brand> <Format>", e.g. "Juniper & Co. UGC". */
export function campaignNameFor(brandName: string, format: ContentFormat): string {
  return `${brandName.trim()} ${contentFormatLabels[format]}`.slice(0, 100);
}

/** Hashtag stem from the brand name, valid under DEC-010 (`[a-z0-9_]{2,50}`). */
export function hashtagBaseFor(brandName: string): string {
  const stem = brandName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  if (stem.length >= 2) return stem;
  return `${stem}brand`;
}

/** Candidate `attempt` (0-based): stem, stem2, stem3, … */
export function hashtagCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}${attempt + 1}`;
}

/** Splits a brand link into website / App Store / Google Play fields, matching workspace creation. */
export function classifyBrandLink(value: string): { websiteUrl: string | null; appStoreUrl: string | null; playStoreUrl: string | null } {
  const trimmed = value.trim();
  const normalized = trimmed ? (/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`) : null;
  const appStore = /apps\.apple\.com/i.test(trimmed);
  const playStore = /play\.google\.com/i.test(trimmed);
  return {
    websiteUrl: appStore || playStore ? null : normalized,
    appStoreUrl: appStore ? normalized : null,
    playStoreUrl: playStore ? normalized : null,
  };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US")}`;
}
