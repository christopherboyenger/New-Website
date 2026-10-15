/**
 * Pure model of the new-campaign form: local state, the payload sent to the
 * server, section/field mapping for errors, and the summaries shown in the
 * section navigation. Framework-free so the server action and the client
 * share one vocabulary (and it is unit-tested).
 */
import {
  defaultApprovals,
  defaultTargeting,
  genderOptions,
  minCreatorLevelLabels,
  minCreatorLevelOptions,
  MIN_DAILY_BUDGET_CENTS,
  platformLabels,
  type GenderTarget,
  type MinCreatorLevel,
  type Platform,
  type PricingMode,
} from "@/domain/campaign";
import type { Feature } from "@/domain/entitlements";
import { contentFormatLabels, type ContentFormat } from "@/domain/playbook-content";
import { countryName, usMetroLabel } from "@/domain/targeting-catalog";
import { formatUsd } from "@/lib/money";

/* ----------------------------------------------------------------------------
 * Sections
 * ------------------------------------------------------------------------- */

export const formSections = [
  { id: "details", label: "Campaign details" },
  { id: "content", label: "Content" },
  { id: "budget", label: "Budget & Rates" },
  { id: "targeting", label: "Targeting" },
  { id: "approvals", label: "Approvals" },
] as const;

export type FormSectionId = (typeof formSections)[number]["id"];

/* ----------------------------------------------------------------------------
 * Local state (what the inputs hold) and the server payload
 * ------------------------------------------------------------------------- */

export interface CampaignFormState {
  name: string;
  /** As typed, without the leading '#'. Normalized (lowercased) by the server. */
  hashtag: string;
  format: ContentFormat;
  pricingMode: PricingMode;
  /** Dollars, as typed. */
  dailyBudget: string;
  /** Dollars per 1K views, as typed; empty = no cap. */
  cpmCap: string;
  countries: string[];
  platforms: Platform[];
  /** Ages as typed; empty = no bound. */
  ageMin: string;
  ageMax: string;
  gender: GenderTarget;
  metros: string[];
  minCreatorLevel: MinCreatorLevel;
  requireCreatorApproval: boolean;
  requireDedicatedAccount: boolean;
}

/** Observed defaults (L17–L22, DEC-015): Slideshow, Daily $500, All countries/platforms/creators, approvals skipped. */
export const DEFAULT_DAILY_BUDGET_CENTS = 500_00;

export function initialCampaignFormState(): CampaignFormState {
  return {
    name: "",
    hashtag: "",
    format: "slideshow",
    pricingMode: "daily",
    dailyBudget: String(DEFAULT_DAILY_BUDGET_CENTS / 100),
    cpmCap: "",
    countries: [...defaultTargeting.countries],
    platforms: [...defaultTargeting.platforms],
    ageMin: "",
    ageMax: "",
    gender: defaultTargeting.gender,
    metros: [...defaultTargeting.metros],
    minCreatorLevel: defaultTargeting.minCreatorLevel,
    requireCreatorApproval: defaultApprovals.requireCreatorApproval,
    requireDedicatedAccount: defaultApprovals.requireDedicatedAccount,
  };
}

/** Payload of the create action. Money in integer cents; ages as integers or null. */
export interface CampaignFormSubmission {
  name: string;
  primaryHashtag: string;
  format: ContentFormat;
  pricingMode: PricingMode;
  dailyBudgetCents: number;
  cpmCapCents: number | null;
  targeting: {
    countries: string[];
    platforms: Platform[];
    ageMin: number | null;
    ageMax: number | null;
    gender: GenderTarget;
    metros: string[];
    minCreatorLevel: MinCreatorLevel;
  };
  approvals: {
    requireCreatorApproval: boolean;
    requireDedicatedAccount: boolean;
  };
}

export type FieldErrors = Record<string, string>;

/**
 * Parses a dollar amount typed by the user ("500", "1,250.50", "$75") into
 * integer cents. Returns null when empty, NaN for anything unparseable.
 */
export function parseDollarsToCents(value: string): number | null {
  const cleaned = value.trim().replace(/^\$/, "").replace(/,/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function parseAge(value: string): number | null {
  const cleaned = value.trim();
  if (cleaned === "") return null;
  return /^\d{1,3}$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

/**
 * Converts form state into the server payload. Only input-shape problems
 * (text where a number belongs) are reported here; every business rule
 * (minimums, hashtag format and uniqueness, entitlements) is the server's.
 */
export function buildSubmission(state: CampaignFormState): { ok: true; submission: CampaignFormSubmission } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const dailyBudgetCents = parseDollarsToCents(state.dailyBudget);
  if (dailyBudgetCents === null || Number.isNaN(dailyBudgetCents)) {
    fieldErrors.dailyBudgetCents = "Enter a daily budget in dollars, for example 500.";
  }
  const cpmCapCents = parseDollarsToCents(state.cpmCap);
  if (cpmCapCents !== null && Number.isNaN(cpmCapCents)) {
    fieldErrors.cpmCapCents = "Enter the CPM cap in dollars, or leave it empty for no cap.";
  }
  const ageMin = parseAge(state.ageMin);
  const ageMax = parseAge(state.ageMax);
  if (ageMin !== null && Number.isNaN(ageMin)) fieldErrors["targeting.ageMin"] = "Enter the minimum age as a whole number.";
  if (ageMax !== null && Number.isNaN(ageMax)) fieldErrors["targeting.ageMax"] = "Enter the maximum age as a whole number.";
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  return {
    ok: true,
    submission: {
      name: state.name,
      primaryHashtag: state.hashtag,
      format: state.format,
      pricingMode: state.pricingMode,
      dailyBudgetCents: dailyBudgetCents as number,
      cpmCapCents,
      targeting: {
        countries: state.countries,
        platforms: state.platforms,
        ageMin,
        ageMax,
        gender: state.gender,
        metros: state.metros,
        minCreatorLevel: state.minCreatorLevel,
      },
      approvals: {
        requireCreatorApproval: state.requireCreatorApproval,
        requireDedicatedAccount: state.requireDedicatedAccount,
      },
    },
  };
}

export function isFormDirty(state: CampaignFormState, initial: CampaignFormState): boolean {
  return JSON.stringify(state) !== JSON.stringify(initial);
}

/* ----------------------------------------------------------------------------
 * Error key → section / field
 * ------------------------------------------------------------------------- */

/** Error keys (zod paths joined with '.') in on-screen order, with the control to focus. */
const errorFields: Array<{ key: string; section: FormSectionId; fieldId: string }> = [
  { key: "name", section: "details", fieldId: "campaign-name" },
  { key: "primaryHashtag", section: "details", fieldId: "campaign-hashtag" },
  { key: "format", section: "content", fieldId: "content-format" },
  { key: "pricingMode", section: "budget", fieldId: "pricing-mode" },
  { key: "dailyBudgetCents", section: "budget", fieldId: "budget-amount" },
  { key: "cpmCapCents", section: "budget", fieldId: "cpm-cap" },
  { key: "targeting.countries", section: "targeting", fieldId: "countries-filter-trigger" },
  { key: "targeting.platforms", section: "targeting", fieldId: "platforms-filter-trigger" },
  { key: "targeting.ageMin", section: "targeting", fieldId: "age-filter-trigger" },
  { key: "targeting.ageMax", section: "targeting", fieldId: "age-filter-trigger" },
  { key: "targeting.gender", section: "targeting", fieldId: "gender-filter-trigger" },
  { key: "targeting.metros", section: "targeting", fieldId: "locations-filter-trigger" },
  { key: "targeting.minCreatorLevel", section: "targeting", fieldId: "creator-level-all" },
  { key: "approvals.requireCreatorApproval", section: "approvals", fieldId: "creator-approval-skip" },
  { key: "approvals.requireDedicatedAccount", section: "approvals", fieldId: "dedicated-account-skip" },
];

/** Section that owns an error key (nested keys such as "targeting.countries.3" resolve to their parent). */
export function sectionForErrorKey(key: string): FormSectionId | null {
  return resolveErrorField(key)?.section ?? null;
}

function resolveErrorField(key: string) {
  return errorFields.find((f) => key === f.key || key.startsWith(`${f.key}.`)) ?? null;
}

/** Collapses nested keys onto the field they belong to (first message wins). */
export function normalizeFieldErrors(fieldErrors: FieldErrors): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, message] of Object.entries(fieldErrors)) {
    const field = resolveErrorField(key);
    const target = field?.key ?? key;
    out[target] ??= message;
  }
  return out;
}

/** The first invalid field in on-screen order: where the form jumps after a failed submit. */
export function firstInvalidField(fieldErrors: FieldErrors): { section: FormSectionId; fieldId: string; key: string } | null {
  for (const field of errorFields) {
    if (fieldErrors[field.key]) return { section: field.section, fieldId: field.fieldId, key: field.key };
  }
  return null;
}

/** Error keys a state field can resolve, cleared when the user edits that field. */
export const errorKeysForField: Record<keyof CampaignFormState, string[]> = {
  name: ["name"],
  hashtag: ["primaryHashtag"],
  format: ["format"],
  pricingMode: ["pricingMode"],
  dailyBudget: ["dailyBudgetCents"],
  cpmCap: ["cpmCapCents"],
  countries: ["targeting.countries", "targeting.metros"],
  platforms: ["targeting.platforms"],
  ageMin: ["targeting.ageMin", "targeting.ageMax"],
  ageMax: ["targeting.ageMin", "targeting.ageMax"],
  gender: ["targeting.gender"],
  metros: ["targeting.metros"],
  minCreatorLevel: ["targeting.minCreatorLevel"],
  requireCreatorApproval: ["approvals.requireCreatorApproval"],
  requireDedicatedAccount: ["approvals.requireDedicatedAccount"],
};

export function clearErrorsForPatch(fieldErrors: FieldErrors, patch: Partial<CampaignFormState>): FieldErrors {
  const keys = (Object.keys(patch) as Array<keyof CampaignFormState>).flatMap((field) => errorKeysForField[field]);
  if (!keys.some((key) => key in fieldErrors)) return fieldErrors;
  const next = { ...fieldErrors };
  for (const key of keys) delete next[key];
  return next;
}

export function sectionsWithErrors(fieldErrors: FieldErrors): Set<FormSectionId> {
  const out = new Set<FormSectionId>();
  for (const key of Object.keys(fieldErrors)) {
    const section = sectionForErrorKey(key);
    if (section) out.add(section);
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * Plan gates used by the form (DEC-006)
 * ------------------------------------------------------------------------- */

export const formGatedFeatures = [
  "manual_pricing",
  "cpm_cap",
  "demographic_targeting",
  "creator_level_targeting",
  "creator_approval",
  "dedicated_accounts",
] as const satisfies readonly Feature[];

export type FormGatedFeature = (typeof formGatedFeatures)[number];
export type FormEntitlements = Record<FormGatedFeature, boolean>;

/** Where an entitlement rejection is shown. */
export const entitlementErrorKeys: Record<FormGatedFeature, string> = {
  manual_pricing: "pricingMode",
  cpm_cap: "cpmCapCents",
  demographic_targeting: "targeting.ageMin",
  creator_level_targeting: "targeting.minCreatorLevel",
  creator_approval: "approvals.requireCreatorApproval",
  dedicated_accounts: "approvals.requireDedicatedAccount",
};

/* ----------------------------------------------------------------------------
 * Summaries shown in the section navigation
 * ------------------------------------------------------------------------- */

export function budgetSummary(state: CampaignFormState): string {
  const cents = parseDollarsToCents(state.dailyBudget);
  if (cents === null || Number.isNaN(cents)) return "Not set";
  return `${formatUsd(cents)} /day`;
}

export function cpmCapSummary(state: CampaignFormState): string | null {
  const cents = parseDollarsToCents(state.cpmCap);
  if (cents === null || Number.isNaN(cents)) return null;
  return `CPM cap ${formatUsd(cents, { decimals: 2 })}`;
}

function listSummary(labels: string[], allLabel: string, noun: string): string {
  if (labels.length === 0) return allLabel;
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.length} ${noun}`;
}

export function countriesSummary(countries: string[]): string {
  return listSummary(countries.map((c) => countryName(c)), "All countries", "countries");
}

export function platformsSummary(platforms: Platform[]): string {
  return listSummary(platforms.map((p) => platformLabels[p]), "All platforms", "platforms");
}

export function metrosSummary(metros: string[]): string {
  return listSummary(metros.map(usMetroLabel), "All of the US", "metro areas");
}

export function ageRangeSummary(ageMin: string, ageMax: string): string {
  const min = ageMin.trim();
  const max = ageMax.trim();
  if (min && max) return `Ages ${min}–${max}`;
  if (min) return `Ages ${min}+`;
  if (max) return `Ages up to ${max}`;
  return "All ages";
}

export const genderLabels: Record<GenderTarget, string> = {
  any: "All genders",
  female: "Female",
  male: "Male",
};

export const genderChoices = genderOptions.filter((g) => g !== "any");

export function creatorLevelSummary(level: MinCreatorLevel): string {
  return minCreatorLevelLabels[level];
}

/** Optional fourth Targeting line listing demographic filters in use. */
export function demographicsSummary(state: CampaignFormState): string | null {
  const parts: string[] = [];
  if (state.ageMin.trim() || state.ageMax.trim()) parts.push(ageRangeSummary(state.ageMin, state.ageMax));
  if (state.gender !== "any") parts.push(genderLabels[state.gender]);
  if (state.metros.length) parts.push(metrosSummary(state.metros));
  return parts.length ? parts.join(" · ") : null;
}

export interface SectionSummary {
  lines: string[];
}

export function sectionSummaries(state: CampaignFormState): Record<FormSectionId, SectionSummary> {
  const name = state.name.trim();
  const tag = state.hashtag.trim().replace(/^#+/, "");
  const cap = cpmCapSummary(state);
  const demographics = demographicsSummary(state);
  return {
    details: { lines: [name || "Not set", tag ? `#${tag}` : "Not set"] },
    content: { lines: [contentFormatLabels[state.format]] },
    budget: { lines: cap ? [budgetSummary(state), cap] : [budgetSummary(state)] },
    targeting: {
      lines: [
        countriesSummary(state.countries),
        platformsSummary(state.platforms),
        creatorLevelSummary(state.minCreatorLevel),
        ...(demographics ? [demographics] : []),
      ],
    },
    approvals: {
      lines: [
        state.requireCreatorApproval ? "Creator approval required" : "Creator approval not required",
        state.requireDedicatedAccount ? "Dedicated account required" : "Dedicated account not required",
      ],
    },
  };
}

/** Creator-level buttons in observed order (All creators / Silver+ / Gold+ / Platinum+ / Diamond). */
export const creatorLevelChoices: readonly MinCreatorLevel[] = minCreatorLevelOptions;

/* ----------------------------------------------------------------------------
 * Budget helpers
 * ------------------------------------------------------------------------- */

export const BUDGET_SLIDER_MIN_DOLLARS = MIN_DAILY_BUDGET_CENTS / 100;
export const BUDGET_SLIDER_MAX_DOLLARS = 5_000;
export const BUDGET_SLIDER_STEP_DOLLARS = 10;

/** Documented weekly averaging of a daily target: 7 × daily. */
export function weeklyAverageCents(dailyCents: number): number {
  return dailyCents * 7;
}

/* ----------------------------------------------------------------------------
 * Hashtag suggestions
 * ------------------------------------------------------------------------- */

const MAX_HASHTAG_LENGTH = 50;

/**
 * Brand token for hashtags: the org name transliterated to ASCII letters and
 * digits, each word capitalized ("Pip's Pops" → "PipsPops"). Empty when the
 * name has no usable characters.
 */
export function hashtagBase(orgName: string): string {
  return orgName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");
}

/** Candidate primary hashtags derived from the org name, in display case (try<Org>, join<Org>, <Org>App). */
export function suggestHashtags(orgName: string): string[] {
  const base = hashtagBase(orgName);
  if (!base) return [];
  const room = MAX_HASHTAG_LENGTH - 4;
  const trimmed = base.slice(0, room);
  const candidates = [`try${trimmed}`, `join${trimmed}`, `${trimmed}App`];
  return [...new Set(candidates)].filter((tag) => /^[A-Za-z0-9_]{2,50}$/.test(tag));
}

/** Placeholder for the hashtag input (observed: the brand name, lowercase). */
export function hashtagPlaceholder(orgName: string): string {
  return hashtagBase(orgName).toLowerCase().slice(0, MAX_HASHTAG_LENGTH) || "yourbrand";
}

/** Placeholder for the campaign name: "<Org> UGC" / "<Org> Slideshow". */
export function campaignNamePlaceholder(orgName: string, format: ContentFormat): string {
  return `${orgName} ${contentFormatLabels[format]}`;
}

/* ----------------------------------------------------------------------------
 * Forecast copy
 * ------------------------------------------------------------------------- */

/** The forecast service's reason without a repeated "Reach estimate unavailable" lead-in. */
export function forecastReasonText(reason: string): string {
  const stripped = reason.replace(/^reach estimate unavailable\s*[—–:-]\s*/i, "").trim();
  if (!stripped) return reason;
  return stripped[0].toUpperCase() + stripped.slice(1);
}
