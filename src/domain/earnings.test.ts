import { describe, expect, it } from "vitest";
import {
  assertValidEarningPolicy,
  computeEarning,
  earningEffectKey,
  grossEarningCents,
  InvalidEarningPolicyError,
  type EarningInput,
  type EarningPolicy,
} from "./earnings";

const policy: EarningPolicy = { id: "test-policy-1", rateCentsPerThousandValidViews: 150, perPostCapCents: null };
const window = { start: new Date("2026-10-01T00:00:00.000Z"), end: new Date("2026-10-02T00:00:00.000Z") };

function input(overrides: Partial<EarningInput> = {}): EarningInput {
  return {
    postId: "pst_a",
    window,
    previousValidViews: 1_000,
    currentValidViews: 11_000,
    alreadyEarnedCents: 0,
    reviewStatus: "approved",
    campaignStatus: "active",
    ...overrides,
  };
}

describe("earning policy", () => {
  it("has no default: a missing or malformed policy is rejected", () => {
    expect(() => assertValidEarningPolicy(null)).toThrow(InvalidEarningPolicyError);
    expect(() => computeEarning(undefined as unknown as EarningPolicy, input())).toThrow(InvalidEarningPolicyError);
    expect(() => assertValidEarningPolicy({ ...policy, id: " " })).toThrow(/version/);
    expect(() => assertValidEarningPolicy({ ...policy, rateCentsPerThousandValidViews: 1.5 })).toThrow(/whole number/);
    expect(() => assertValidEarningPolicy({ ...policy, rateCentsPerThousandValidViews: -1 })).toThrow(/non-negative/);
    expect(() => assertValidEarningPolicy({ ...policy, perPostCapCents: -5 })).toThrow(/cap/);
    expect(() => assertValidEarningPolicy(policy)).not.toThrow();
  });
});

describe("computeEarning", () => {
  it("pays the valid-view delta at the rate per 1,000", () => {
    const result = computeEarning(policy, input());
    expect(result).toMatchObject({ validViewDelta: 10_000, amountCents: 1_500, outcome: "earned", capped: false, policyId: "test-policy-1" });
  });

  it("never goes negative on counter corrections and treats a first observation as the baseline", () => {
    expect(computeEarning(policy, input({ previousValidViews: 5_000, currentValidViews: 4_000 }))).toMatchObject({ validViewDelta: 0, amountCents: 0, outcome: "no_new_valid_views" });
    expect(computeEarning(policy, input({ previousValidViews: null, currentValidViews: 50_000 }))).toMatchObject({ validViewDelta: 0, amountCents: 0 });
  });

  it("rounds down to whole cents", () => {
    expect(computeEarning(policy, input({ previousValidViews: 0, currentValidViews: 999 })).amountCents).toBe(149); // 149.85
    expect(computeEarning({ ...policy, rateCentsPerThousandValidViews: 1 }, input({ previousValidViews: 0, currentValidViews: 999 })).amountCents).toBe(0);
    expect(grossEarningCents(Number.MAX_SAFE_INTEGER, 1000)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("earns nothing for paused/inactive campaigns or unapproved posts", () => {
    expect(computeEarning(policy, input({ campaignStatus: "paused" }))).toMatchObject({ amountCents: 0, outcome: "campaign_not_active", validViewDelta: 10_000 });
    expect(computeEarning(policy, input({ campaignStatus: "inactive" })).amountCents).toBe(0);
    expect(computeEarning(policy, input({ campaignStatus: null })).amountCents).toBe(0);
    expect(computeEarning(policy, input({ reviewStatus: "submitted" }))).toMatchObject({ amountCents: 0, outcome: "post_not_approved" });
    expect(computeEarning(policy, input({ reviewStatus: "rejected" })).amountCents).toBe(0);
  });

  it("applies the per-post cap against what was already earned", () => {
    const capped = { ...policy, perPostCapCents: 2_000 };
    expect(computeEarning(capped, input({ alreadyEarnedCents: 1_000 }))).toMatchObject({ amountCents: 1_000, capped: true, outcome: "earned" });
    expect(computeEarning(capped, input({ alreadyEarnedCents: 0 }))).toMatchObject({ amountCents: 1_500, capped: false });
    expect(computeEarning(capped, input({ alreadyEarnedCents: 2_000 }))).toMatchObject({ amountCents: 0, capped: true, outcome: "cap_reached" });
    expect(computeEarning(capped, input({ alreadyEarnedCents: 2_500 })).amountCents).toBe(0);
    expect(computeEarning({ ...policy, perPostCapCents: 0 }, input())).toMatchObject({ amountCents: 0, outcome: "cap_reached" });
  });

  it("rejects malformed inputs instead of guessing", () => {
    expect(() => computeEarning(policy, input({ currentValidViews: -1 }))).toThrow(RangeError);
    expect(() => computeEarning(policy, input({ previousValidViews: 1.5 }))).toThrow(RangeError);
    expect(() => computeEarning(policy, input({ alreadyEarnedCents: -1 }))).toThrow(RangeError);
    expect(() => computeEarning(policy, input({ window: { start: window.end, end: window.start } }))).toThrow(RangeError);
  });
});

describe("earningEffectKey", () => {
  it("is deterministic per post and window and independent of the policy", () => {
    const a = computeEarning(policy, input());
    const b = computeEarning({ ...policy, id: "test-policy-2", rateCentsPerThousandValidViews: 300 }, input());
    expect(a.effectKey).toBe(b.effectKey);
    expect(a.effectKey).toBe("earning:pst_a:2026-10-01T00:00:00.000Z/2026-10-02T00:00:00.000Z");
    expect(earningEffectKey("pst_b", window)).not.toBe(a.effectKey);
    expect(earningEffectKey("pst_a", { start: window.end, end: new Date("2026-10-03T00:00:00.000Z") })).not.toBe(a.effectKey);
    expect(() => earningEffectKey("", window)).toThrow(RangeError);
  });
});
