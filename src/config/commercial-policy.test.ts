import { describe, expect, it } from "vitest";
import { commercialPolicy, paymentSetupDisclosure, planSummary } from "./commercial-policy";

describe("commercial policy copy", () => {
  it("does not promise a subscription credit that is not applied while the policy is undecided", () => {
    // BILLING-14: no subscription_credit is granted while `decided` is false.
    expect(commercialPolicy.decided).toBe(false);
    for (const planId of ["basic", "unlimited"] as const) {
      expect(planSummary(planId)).not.toMatch(/credit/i);
    }
  });

  it("does not mention a validation charge while it is disabled", () => {
    expect(commercialPolicy.paymentSetupValidationCharge.enabled).toBe(false);
    expect(paymentSetupDisclosure()).not.toMatch(/\$|validation/i);
  });
});
