/**
 * Plan-gated features observed with a "Requires Unlimited" badge (L18–L22,
 * creator messaging). Server commands must call `assertEntitled` — hiding a
 * control is never the enforcement.
 */
import type { PlanId } from "@/server/db/schema/core";
import type { CampaignApprovals, CampaignTargeting, PricingMode } from "./campaign";

export const features = [
  "manual_pricing",
  "cpm_cap",
  "demographic_targeting",
  "creator_level_targeting",
  "creator_approval",
  "dedicated_accounts",
  "creator_messaging",
] as const;
export type Feature = (typeof features)[number];

const unlimitedOnly: ReadonlySet<Feature> = new Set(features);

export function hasFeature(planId: PlanId, feature: Feature): boolean {
  return planId === "unlimited" || !unlimitedOnly.has(feature);
}

export class EntitlementError extends Error {
  constructor(public readonly feature: Feature) {
    super(`This setting requires the Unlimited plan (${feature}).`);
    this.name = "EntitlementError";
  }
}

export function assertEntitled(planId: PlanId, feature: Feature): void {
  if (!hasFeature(planId, feature)) throw new EntitlementError(feature);
}

export interface CampaignSettingsForGate {
  pricingMode: PricingMode;
  cpmCapCents: number | null;
  targeting: CampaignTargeting;
  approvals: CampaignApprovals;
}

/** Every gated feature a set of campaign settings uses. Empty = allowed on any plan. */
export function gatedFeaturesUsed(settings: CampaignSettingsForGate): Feature[] {
  const used: Feature[] = [];
  if (settings.pricingMode === "manual") used.push("manual_pricing");
  if (settings.cpmCapCents !== null) used.push("cpm_cap");
  const t = settings.targeting;
  if (t.ageMin !== null || t.ageMax !== null || t.gender !== "any" || t.metros.length > 0) used.push("demographic_targeting");
  if (t.minCreatorLevel !== "all") used.push("creator_level_targeting");
  if (settings.approvals.requireCreatorApproval) used.push("creator_approval");
  if (settings.approvals.requireDedicatedAccount) used.push("dedicated_accounts");
  return used;
}

export function missingEntitlements(planId: PlanId, settings: CampaignSettingsForGate): Feature[] {
  return gatedFeaturesUsed(settings).filter((f) => !hasFeature(planId, f));
}
