/**
 * Creator earning primitives (pure, framework-free).
 *
 * There is deliberately NO default policy: every computation takes an explicit
 * `EarningPolicy`, and the server reports `earningPolicyConfigured() === false`
 * until the business decides the inputs below, so no earning job can run on
 * guessed numbers (docs/spec/production-requirements.md "Review, metric
 * ingestion, and earnings"; reference-build-specification.md §5 acceptance
 * checks: "prohibit paused/unapproved earnings", "confirm unresolved rounding,
 * reversal, view-quality, concurrency … policies before production").
 *
 * What these functions do decide (mechanics, not commercial terms):
 * - Valid-view growth is a correction-aware delta of a cumulative counter
 *   (`counterDelta`): a first observation only sets the baseline, and a
 *   decreasing counter (provider correction) yields 0, never a negative.
 * - Amount = floor(validViewDelta × rate / 1,000) in whole cents (rounded
 *   down, exact integer arithmetic), then limited by the remaining per-post cap.
 * - A post that is not approved, or whose campaign is not active, earns 0.
 * - Each post+window has one deterministic effect key so a retried job can
 *   never write the same earning twice.
 */
import type { CampaignStatus } from "./campaign";
import { counterDelta } from "./reporting-math";

/** Review states a post can be in (mirrors the posts table vocabulary). */
export type EarningReviewStatus = "submitted" | "approved" | "rejected";

/**
 * Inputs the business must decide before earning jobs may run. Each one is
 * an open product/commercial decision; none was recovered from the reference.
 */
export const earningPolicyOpenDecisions = [
  "Valid-view definition: which provider counter counts, minimum watch time, and fraud/duplicate filtering.",
  "Rate: cents paid per 1,000 valid views, per platform/country, and when the rate is locked for a post.",
  "Per-post payout cap (lifetime), if any.",
  "Earning window length and alignment (UTC), and the latest observation accepted for a closed window.",
  "Rounding remainder handling (this module rounds each window down to whole cents).",
  "Pause and reactivation: whether views accrued while a campaign was paused are ever back-filled.",
  "Reversals: what happens to earnings when a post is later rejected, deleted or found fraudulent.",
  "Funding: when an unpaid or charge-failed brand stops creating earning liabilities.",
] as const;

export interface EarningPolicy {
  /** Stable identifier of the decided policy version, recorded with every earning. */
  id: string;
  /** Integer cents paid per 1,000 valid views. */
  rateCentsPerThousandValidViews: number;
  /** Lifetime cap per post in integer cents; null means the business decided there is no cap. */
  perPostCapCents: number | null;
}

export class InvalidEarningPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEarningPolicyError";
  }
}

/** Throws unless the policy is complete and uses non-negative integer cents. */
export function assertValidEarningPolicy(policy: EarningPolicy | null | undefined): asserts policy is EarningPolicy {
  if (!policy) throw new InvalidEarningPolicyError("An explicit earning policy is required; there is no default.");
  if (!policy.id || !policy.id.trim()) throw new InvalidEarningPolicyError("The earning policy needs a version identifier.");
  if (!Number.isSafeInteger(policy.rateCentsPerThousandValidViews) || policy.rateCentsPerThousandValidViews < 0) {
    throw new InvalidEarningPolicyError("The rate must be a non-negative whole number of cents per 1,000 valid views.");
  }
  if (policy.perPostCapCents !== null && (!Number.isSafeInteger(policy.perPostCapCents) || policy.perPostCapCents < 0)) {
    throw new InvalidEarningPolicyError("The per-post cap must be a non-negative whole number of cents, or null for no cap.");
  }
}

/** A closed UTC earning window, [start, end). */
export interface EarningWindow {
  start: Date;
  end: Date;
}

export interface EarningInput {
  postId: string;
  window: EarningWindow;
  /** Cumulative valid views at the start of the window; null = never observed before (baseline only). */
  previousValidViews: number | null;
  /** Cumulative valid views at the end of the window. */
  currentValidViews: number;
  /** Cents this post has already earned in earlier windows (for the per-post cap). */
  alreadyEarnedCents: number;
  reviewStatus: EarningReviewStatus;
  campaignStatus: CampaignStatus | null;
}

export type EarningOutcome = "earned" | "post_not_approved" | "campaign_not_active" | "no_new_valid_views" | "cap_reached";

export interface EarningResult {
  /** Deterministic idempotency key for the ledger effect of this post+window. */
  effectKey: string;
  policyId: string;
  validViewDelta: number;
  /** Integer cents, never negative. */
  amountCents: number;
  /** True when the per-post cap reduced the amount. */
  capped: boolean;
  outcome: EarningOutcome;
}

/** Deterministic effect key for one post and one UTC window (independent of policy, so a policy change cannot pay a window twice). */
export function earningEffectKey(postId: string, window: EarningWindow): string {
  assertValidWindow(window);
  if (!postId) throw new RangeError("postId is required.");
  return `earning:${postId}:${window.start.toISOString()}/${window.end.toISOString()}`;
}

/** floor(views × rate / 1000) with exact integer arithmetic. */
export function grossEarningCents(validViews: number, rateCentsPerThousand: number): number {
  if (!Number.isSafeInteger(validViews) || validViews < 0) throw new RangeError("Valid views must be a non-negative integer.");
  if (!Number.isSafeInteger(rateCentsPerThousand) || rateCentsPerThousand < 0) throw new RangeError("Rate must be a non-negative integer.");
  return Number((BigInt(validViews) * BigInt(rateCentsPerThousand)) / BigInt(1000));
}

/** Computes one post's earning for one window under an explicit policy. */
export function computeEarning(policy: EarningPolicy, input: EarningInput): EarningResult {
  assertValidEarningPolicy(policy);
  if (!Number.isSafeInteger(input.currentValidViews) || input.currentValidViews < 0) throw new RangeError("currentValidViews must be a non-negative integer.");
  if (input.previousValidViews !== null && (!Number.isSafeInteger(input.previousValidViews) || input.previousValidViews < 0)) {
    throw new RangeError("previousValidViews must be a non-negative integer or null.");
  }
  if (!Number.isSafeInteger(input.alreadyEarnedCents) || input.alreadyEarnedCents < 0) throw new RangeError("alreadyEarnedCents must be a non-negative integer.");

  const effectKey = earningEffectKey(input.postId, input.window);
  const validViewDelta = counterDelta(input.previousValidViews, input.currentValidViews);
  const base = { effectKey, policyId: policy.id, validViewDelta, capped: false };

  if (input.reviewStatus !== "approved") return { ...base, amountCents: 0, outcome: "post_not_approved" };
  if (input.campaignStatus !== "active") return { ...base, amountCents: 0, outcome: "campaign_not_active" };
  if (validViewDelta === 0) return { ...base, amountCents: 0, outcome: "no_new_valid_views" };

  const gross = grossEarningCents(validViewDelta, policy.rateCentsPerThousandValidViews);
  if (policy.perPostCapCents === null) return { ...base, amountCents: gross, outcome: "earned" };

  const remaining = Math.max(0, policy.perPostCapCents - input.alreadyEarnedCents);
  if (remaining === 0) return { ...base, amountCents: 0, capped: gross > 0, outcome: "cap_reached" };
  if (gross > remaining) return { ...base, amountCents: remaining, capped: true, outcome: "earned" };
  return { ...base, amountCents: gross, outcome: "earned" };
}

function assertValidWindow(window: EarningWindow): void {
  const start = window.start.getTime();
  const end = window.end.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new RangeError("An earning window needs a valid start before its end.");
}
