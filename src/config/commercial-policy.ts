/**
 * Commercial policy — the single source for plan names, prices, credits and
 * billing disclosures shown in pricing, onboarding, billing and receipts.
 *
 * The reference product showed CONFLICTING terms (docs/spec/reference-build-
 * specification.md "Billing"; DEC-007). Nothing here is a decided policy until
 * `decided` is true. Money-moving features that depend on an undecided value
 * stay disabled, and copy that would promise them is not rendered.
 */
import type { PlanId } from "@/server/db/schema/core";

export interface PlanDefinition {
  id: PlanId;
  /** Display label. The reference used both "Standard" (pricing) and "Basic" (billing); one label is used everywhere here. */
  displayName: string;
  monthlyPriceCents: number;
  /** Whether the subscription amount is credited toward campaign spend. */
  creditedToCampaignSpend: boolean;
  summary: string;
  features: string[];
}

export const commercialPolicy = {
  /** Flip to true only after the business signs off on every value below. */
  decided: false,
  plans: {
    basic: {
      id: "basic",
      displayName: "Standard",
      monthlyPriceCents: 0,
      creditedToCampaignSpend: false,
      summary: "No monthly platform fee. Pay as creators earn.",
      features: ["No creator or campaign limits", "Pay-as-you-go billing", "Slideshow and UGC campaigns"],
    },
    unlimited: {
      id: "unlimited",
      displayName: "Unlimited",
      monthlyPriceCents: 99_00,
      creditedToCampaignSpend: true,
      summary: "Monthly minimum spend, credited toward campaign spend.",
      features: [
        "Manual pricing and CPM caps",
        "Demographic and creator-level targeting",
        "Creator approval and dedicated accounts",
        "Creator messaging",
      ],
    },
  } satisfies Record<PlanId, PlanDefinition>,
  /** Monetary charge thresholds (not time intervals). */
  billingThresholdOptionsCents: [10_00, 25_00, 50_00] as const,
  defaultBillingThresholdCents: 50_00,
  /** Spend-matching promotion. Disabled until eligibility/expiry/refund rules are decided. */
  matchingCredit: {
    enabled: false,
    capCents: 500_00,
  },
  /** Card validation charge observed in reference Billing. Disabled until the disclosure policy is decided. */
  paymentSetupValidationCharge: {
    enabled: false,
    amountCents: 5_00,
    refundable: false,
    appliedToFutureCreatorPayments: true,
  },
} as const;

export function planDisplayName(planId: PlanId): string {
  return commercialPolicy.plans[planId].displayName;
}

/** One disclosure string reused at payment setup, confirmation, pricing and billing. */
export function paymentSetupDisclosure(): string {
  const charge = commercialPolicy.paymentSetupValidationCharge;
  if (charge.enabled) {
    return `Adding a card charges a ${charge.refundable ? "refundable" : "non-refundable"} $${(charge.amountCents / 100).toFixed(2)} validation credit${
      charge.appliedToFutureCreatorPayments ? ", applied to future creator payments" : ""
    }. After that you are charged only as creators earn.`;
  }
  return "Adding a card does not charge it. You are charged only as creators earn, in increments of your billing threshold.";
}
