/**
 * Pure billing rules (no I/O), shared by the billing commands, the webhook
 * processor and the Billing page. See docs/decisions/billing.md.
 */
import type { PlanId } from "../db/schema/core";
import type { BillingSubscriptionStatus } from "../db/schema/ext-billing-integrations";
import type { LedgerAccount, PaymentMethodStatus } from "../db/schema/money";

/* ----------------------------------------------------------------------------
 * Ledger semantics
 * ------------------------------------------------------------------------- */

/** Credit ledgers: positive entries grant credit, negative entries apply (draw down) it. */
export const creditAccounts = ["subscription_credit", "matching_credit", "validation_credit"] as const satisfies readonly LedgerAccount[];
export type CreditAccount = (typeof creditAccounts)[number];

/** Ledger accounts listed under each Billing activity tab. */
export const activityAccounts = {
  payments: ["cash_charge"],
  credits: creditAccounts,
} as const satisfies Record<string, readonly LedgerAccount[]>;
export type ActivityTab = keyof typeof activityAccounts;

/** `ref_type` of a cash charge that paid the plan subscription rather than campaign spend. */
export const SUBSCRIPTION_INVOICE_REF = "stripe_subscription_invoice";
/** `ref_type` of a cash charge that paid campaign spend. */
export const SPEND_INVOICE_REF = "stripe_invoice";

export interface LedgerTotals {
  /** Σ campaign_spend entries (spend accrued as creators earn). */
  campaignSpendCents: number;
  /** Σ cash_charge entries that paid campaign spend (subscription payments excluded). */
  spendChargesCents: number;
  /** Per credit ledger: Σ positive entries (granted) and Σ |negative entries| (applied). */
  credits: Record<CreditAccount, { grantedCents: number; appliedCents: number }>;
}

export function emptyLedgerTotals(): LedgerTotals {
  return {
    campaignSpendCents: 0,
    spendChargesCents: 0,
    credits: {
      subscription_credit: { grantedCents: 0, appliedCents: 0 },
      matching_credit: { grantedCents: 0, appliedCents: 0 },
      validation_credit: { grantedCents: 0, appliedCents: 0 },
    },
  };
}

/**
 * Current balance = campaign spend not yet charged: recorded campaign spend,
 * minus cash charges that paid campaign spend, minus credits applied to it.
 * Plan-subscription payments never reduce it. Integer cents; may be negative
 * only if a provider over-collected, which is shown as is (never clamped).
 */
export function currentBalanceCents(totals: LedgerTotals): number {
  const applied = creditAccounts.reduce((sum, account) => sum + totals.credits[account].appliedCents, 0);
  return totals.campaignSpendCents - totals.spendChargesCents - applied;
}

export function creditRemainingCents(totals: LedgerTotals, account: CreditAccount): number {
  const { grantedCents, appliedCents } = totals.credits[account];
  return grantedCents - appliedCents;
}

/* ----------------------------------------------------------------------------
 * Plan from provider subscriptions
 * ------------------------------------------------------------------------- */

/** Statuses that keep the Unlimited plan. `past_due` keeps it while the provider retries payment. */
export const planGrantingStatuses: ReadonlySet<BillingSubscriptionStatus> = new Set(["active", "trialing", "past_due"]);

const knownSubscriptionStatuses: ReadonlySet<string> = new Set<BillingSubscriptionStatus>([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

/** Unknown provider statuses are treated as not granting the plan. */
export function normalizeSubscriptionStatus(status: string): BillingSubscriptionStatus {
  return knownSubscriptionStatuses.has(status) ? (status as BillingSubscriptionStatus) : "incomplete";
}

export interface SubscriptionSnapshot {
  status: BillingSubscriptionStatus;
  priceIds: string[];
}

/**
 * The plan an organization is entitled to from its provider-confirmed
 * subscriptions: Unlimited while any subscription to the Unlimited price is in
 * a plan-granting status, otherwise Basic.
 */
export function planFromSubscriptions(subscriptions: SubscriptionSnapshot[], unlimitedPriceId: string | null | undefined): PlanId {
  const granting = subscriptions.some(
    (s) => planGrantingStatuses.has(s.status) && (!unlimitedPriceId || s.priceIds.includes(unlimitedPriceId)),
  );
  return granting ? "unlimited" : "basic";
}

/* ----------------------------------------------------------------------------
 * Payment method
 * ------------------------------------------------------------------------- */

/** Maps a provider SetupIntent status to the stored payment-method status (null = leave unchanged). */
export function paymentStatusFromSetupIntent(status: string, hasError: boolean): PaymentMethodStatus | null {
  switch (status) {
    case "succeeded":
      return "ready";
    case "requires_action":
    case "requires_confirmation":
      return "requires_action";
    case "processing":
      return "pending";
    case "requires_payment_method":
      return hasError ? "failed" : null;
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

/* ----------------------------------------------------------------------------
 * Hosted-session return paths
 * ------------------------------------------------------------------------- */

/**
 * Hosted provider pages may only return to this product's own onboarding or
 * to a page inside the caller's workspace — never to a client-chosen URL.
 */
export function isAllowedReturnPath(path: string, orgSlug: string): boolean {
  if (path === "/onboarding") return true;
  const prefix = `/home/${orgSlug}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return /^[a-z0-9][a-z0-9/_-]{0,199}$/i.test(rest) && !rest.includes("//");
}

/* ----------------------------------------------------------------------------
 * Business information
 * ------------------------------------------------------------------------- */

export const businessAddressFields = ["line1", "line2", "city", "region", "postalCode", "country"] as const;
export type BusinessAddressField = (typeof businessAddressFields)[number];
export type BusinessAddress = Partial<Record<BusinessAddressField, string>>;

/** One-line rendering of a stored address (empty parts skipped). */
export function formatBusinessAddress(address: BusinessAddress | null | undefined): string {
  if (!address) return "";
  const cityLine = [address.city, [address.region, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [address.line1, address.line2, cityLine, address.country].filter(Boolean).join(", ");
}
