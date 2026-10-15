"use server";

/**
 * Server Actions behind /home/{org}/campaigns/new (L17–L22).
 *
 * Every action re-authorizes from the URL slug (membership + permission) and
 * works only on the authorized organization. Campaign creation reuses the
 * foundation command (validation, plan entitlements, platform-wide hashtag
 * uniqueness) and always creates the campaign Inactive: nothing here
 * activates, publishes or charges.
 */
import "server-only";
import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { planDisplayName } from "@/config/commercial-policy";
import { defaultTargeting, isValidHashtag, normalizeHashtag } from "@/domain/campaign";
import { EntitlementError, hasFeature, missingEntitlements, type Feature } from "@/domain/entitlements";
import { contentFormats } from "@/domain/playbook-content";
import { isCountryCode, isUsMetroId, metroTargetingApplies } from "@/domain/targeting-catalog";
import type { PlanId } from "./db/schema/core";
import {
  DEFAULT_DAILY_BUDGET_CENTS,
  entitlementErrorKeys,
  formGatedFeatures,
  hashtagPlaceholder,
  normalizeFieldErrors,
  suggestHashtags,
  type FieldErrors,
  type FormEntitlements,
  type FormGatedFeature,
} from "@/components/campaign-form/model";
import { fail, ok, runAction, type ActionResult } from "./action-result";
import { hasPermission, requireOrgAction } from "./authz";
import { campaignInputSchema, createCampaign, HashtagTakenError, isHashtagAvailable, targetingSchema } from "./campaigns-core";
import { getDb } from "./db/client";
import { campaigns } from "./db/schema";
import { forecastReach, type Forecast } from "./forecast";
import { consumeRateLimit } from "./rate-limit";

/** Availability checks per user per minute (the form debounces typing). */
const HASHTAG_CHECKS_PER_MINUTE = 60;

const MANUAL_PRICING_UNAVAILABLE =
  "Manual pricing isn't available yet: manual rate cards haven't been set up for this product. Use Daily pricing.";

export interface NewCampaignFormData {
  org: { slug: string; name: string };
  plan: { id: PlanId; name: string };
  /** Display name of the plan that unlocks gated settings. */
  unlimitedPlanName: string;
  /** campaign:manage — Members see a read-only explanation instead of the form. */
  canManage: boolean;
  /** Upgrade/billing route, only for users who can see billing. */
  billingHref: string | null;
  entitlements: FormEntitlements;
  /** Suggested primary hashtags (display case) that are currently unused. */
  recommendedHashtags: string[];
  hashtagPlaceholder: string;
  /** Estimate for the form defaults; null when the viewer cannot create campaigns. */
  initialForecast: Forecast | null;
}

/** Everything the new-campaign page needs, for the authorized workspace only. */
export async function loadNewCampaignFormAction(slug: string): Promise<ActionResult<NewCampaignFormData>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "workspace:read");
    const { org } = ctx;
    const canManage = hasPermission(ctx, "campaign:manage");
    const entitlements = Object.fromEntries(formGatedFeatures.map((f) => [f, hasFeature(org.planId, f)])) as FormEntitlements;
    const [recommendedHashtags, initialForecast] = canManage
      ? await Promise.all([
          unusedHashtagSuggestions(org.name),
          forecastReach({ dailyBudgetCents: DEFAULT_DAILY_BUDGET_CENTS, format: "slideshow", targeting: defaultTargeting }),
        ])
      : [[], null];
    return ok({
      org: { slug: org.slug, name: org.name },
      plan: { id: org.planId, name: planDisplayName(org.planId) },
      unlimitedPlanName: planDisplayName("unlimited"),
      canManage,
      billingHref: hasPermission(ctx, "billing:view") ? `/home/${org.slug}/billing` : null,
      entitlements,
      recommendedHashtags,
      hashtagPlaceholder: hashtagPlaceholder(org.name),
      initialForecast,
    });
  });
}

export type HashtagCheck = { tag: string; status: "available" | "taken" } | { tag: string; status: "invalid"; message: string };

/**
 * Live availability check for the Primary Hashtag field. Hashtags are unique
 * across the platform (DEC-010), so "taken" may refer to another workspace's
 * campaign; nothing about that campaign is revealed.
 */
export async function checkCampaignHashtagAction(slug: string, tag: unknown): Promise<ActionResult<HashtagCheck>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "campaign:manage");
    const parsed = z.string().max(200).safeParse(tag);
    if (!parsed.success) return fail("Enter a hashtag.", "validation", { primaryHashtag: "Enter a hashtag." });
    const normalized = normalizeHashtag(parsed.data);
    if (!isValidHashtag(normalized)) {
      return ok({ tag: normalized, status: "invalid", message: "Use 2–50 letters, numbers or underscores." });
    }
    const limit = await consumeRateLimit(`campaign-hashtag-check:${ctx.user.id}`, HASHTAG_CHECKS_PER_MINUTE, 60);
    if (!limit.allowed) {
      return fail("Availability checks are paused for a minute. The hashtag is checked again when you create the campaign.", "rate_limited");
    }
    return ok({ tag: normalized, status: (await isHashtagAvailable(normalized)) ? "available" : "taken" });
  });
}

const estimateInputSchema = z.object({
  dailyBudgetCents: z.number().int().min(0).max(1_000_000_00),
  format: z.enum(contentFormats),
  targeting: targetingSchema,
});

/** Re-estimates reach for the current settings. Returns the forecast contract as-is (currently always "unavailable", DEC-008). */
export async function estimateCampaignReachAction(slug: string, input: unknown): Promise<ActionResult<Forecast>> {
  return runAction(async () => {
    await requireOrgAction(slug, "campaign:manage");
    const parsed = estimateInputSchema.safeParse(input);
    if (!parsed.success) return fail("These settings can't be estimated.", "validation");
    return ok(await forecastReach(parsed.data));
  });
}

export interface CreatedCampaign {
  campaignId: string;
  name: string;
  /** Where the form navigates after creation. */
  href: string;
}

/**
 * Creates the campaign (Inactive) from the form payload. Validation problems
 * come back as field errors keyed by the input path ("name",
 * "targeting.metros", …) so the form can jump to the right section; inputs
 * are never lost because the client keeps its own state.
 */
export async function createCampaignAction(slug: string, raw: unknown): Promise<ActionResult<CreatedCampaign>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "campaign:manage");

    const parsed = campaignInputSchema.safeParse(raw);
    const fieldErrors: FieldErrors = { ...(parsed.success ? {} : issuesToFieldErrors(parsed.error)) };
    for (const [key, message] of Object.entries(formPolicyErrors(raw))) fieldErrors[key] ??= message;
    if (!parsed.success || Object.keys(fieldErrors).length) {
      return fail("Check the highlighted fields.", "validation", normalizeFieldErrors(fieldErrors));
    }

    const input = {
      ...parsed.data,
      targeting: {
        ...parsed.data.targeting,
        countries: [...new Set(parsed.data.targeting.countries)],
        platforms: [...new Set(parsed.data.targeting.platforms)],
        metros: [...new Set(parsed.data.targeting.metros)],
      },
    };

    const missing = missingEntitlements(ctx.org.planId, input);
    if (missing.length) return entitlementFailure(missing);

    let created;
    try {
      created = await createCampaign(ctx, input);
    } catch (error) {
      if (error instanceof HashtagTakenError) return fail(error.message, "conflict", { primaryHashtag: error.message });
      if (error instanceof EntitlementError) return entitlementFailure([error.feature]);
      throw error;
    }

    revalidatePath(`/home/${ctx.org.slug}/campaigns`);
    revalidatePath(`/home/${ctx.org.slug}`);
    return ok(
      { campaignId: created.id, name: created.name, href: `/home/${ctx.org.slug}/campaigns?tab=campaigns&created=${encodeURIComponent(created.id)}` },
      "Campaign created. It stays Inactive until you activate it.",
    );
  });
}

/* ----------------------------------------------------------------------------
 * Helpers (not exported: a "use server" module exposes only actions)
 * ------------------------------------------------------------------------- */

function issuesToFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    out[key] ??= issue.code === "invalid_type" ? invalidTypeMessage(key) : issue.message;
  }
  return out;
}

/** Friendlier messages for missing/mistyped values than zod's "expected number". */
function invalidTypeMessage(key: string): string {
  switch (key) {
    case "name":
      return "Enter a campaign name.";
    case "primaryHashtag":
      return "Enter a primary hashtag.";
    case "format":
      return "Choose Slideshow or UGC.";
    case "dailyBudgetCents":
      return "Enter a daily budget in dollars.";
    case "cpmCapCents":
      return "Enter the CPM cap in dollars, or leave it empty for no cap.";
    default:
      return "Check this setting.";
  }
}

/** Rules this form adds on top of the shared campaign schema. */
function formPolicyErrors(raw: unknown): FieldErrors {
  const errors: FieldErrors = {};
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as { pricingMode?: unknown; targeting?: unknown };
  // No manual rate-card model exists, so Manual pricing is unavailable on every plan (CAMPAIGN-FORM-02).
  if (input.pricingMode === "manual") errors.pricingMode = MANUAL_PRICING_UNAVAILABLE;
  const targeting = targetingSchema.safeParse(input.targeting ?? {});
  if (targeting.success) {
    const { countries, metros } = targeting.data;
    if (countries.some((code) => !isCountryCode(code))) errors["targeting.countries"] = "Choose countries from the list.";
    if (metros.some((id) => !isUsMetroId(id))) {
      errors["targeting.metros"] = "Choose metro areas from the list.";
    } else if (metros.length && !metroTargetingApplies(countries)) {
      errors["targeting.metros"] = "Metro areas only apply to US creators. Add United States to Countries, or remove the metro filter.";
    }
  }
  return errors;
}

function entitlementFailure(features: Feature[]): ActionResult<never> {
  const planName = planDisplayName("unlimited");
  const fieldErrors: FieldErrors = {};
  for (const feature of features) {
    const key = entitlementErrorKeys[feature as FormGatedFeature];
    if (key) fieldErrors[key] ??= `Requires the ${planName} plan.`;
  }
  return fail(`Some settings require the ${planName} plan. Turn them off to create this campaign on your current plan.`, "entitlement", fieldErrors);
}

/** Org-name suggestions minus hashtags already used by any campaign. */
async function unusedHashtagSuggestions(orgName: string): Promise<string[]> {
  const candidates = suggestHashtags(orgName);
  if (!candidates.length) return [];
  const db = await getDb();
  const rows = await db
    .select({ tag: campaigns.primaryHashtag })
    .from(campaigns)
    .where(inArray(campaigns.primaryHashtag, candidates.map(normalizeHashtag)));
  const taken = new Set(rows.map((r) => r.tag));
  return candidates.filter((tag) => !taken.has(normalizeHashtag(tag)));
}
