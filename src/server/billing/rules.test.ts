import { describe, expect, it } from "vitest";
import { formatBusinessAddress, isAllowedReturnPath, normalizeSubscriptionStatus, paymentStatusFromSetupIntent, planFromSubscriptions } from "./rules";

describe("billing rules", () => {
  it("derives the plan from provider subscription states", () => {
    expect(planFromSubscriptions([], "price_u")).toBe("basic");
    expect(planFromSubscriptions([{ status: "active", priceIds: ["price_u"] }], "price_u")).toBe("unlimited");
    expect(planFromSubscriptions([{ status: "past_due", priceIds: ["price_u"] }], "price_u")).toBe("unlimited");
    expect(planFromSubscriptions([{ status: "canceled", priceIds: ["price_u"] }], "price_u")).toBe("basic");
    expect(planFromSubscriptions([{ status: "unpaid", priceIds: ["price_u"] }], "price_u")).toBe("basic");
    expect(planFromSubscriptions([{ status: "active", priceIds: ["price_other"] }], "price_u")).toBe("basic");
    expect(planFromSubscriptions([{ status: "canceled", priceIds: ["price_u"] }, { status: "active", priceIds: ["price_u"] }], "price_u")).toBe("unlimited");
  });

  it("treats unknown provider statuses as not granting", () => {
    expect(normalizeSubscriptionStatus("something_new")).toBe("incomplete");
    expect(normalizeSubscriptionStatus("trialing")).toBe("trialing");
  });

  it("maps setup intent outcomes", () => {
    expect(paymentStatusFromSetupIntent("succeeded", false)).toBe("ready");
    expect(paymentStatusFromSetupIntent("requires_action", false)).toBe("requires_action");
    expect(paymentStatusFromSetupIntent("requires_payment_method", true)).toBe("failed");
    expect(paymentStatusFromSetupIntent("requires_payment_method", false)).toBeNull();
    expect(paymentStatusFromSetupIntent("processing", false)).toBe("pending");
  });

  it("allows only onboarding or the caller's own workspace as hosted return paths", () => {
    expect(isAllowedReturnPath("/onboarding", "acme")).toBe(true);
    expect(isAllowedReturnPath("/home/acme/billing", "acme")).toBe(true);
    expect(isAllowedReturnPath("/home/acme/campaigns/cmp_1/playbooks/pbk_1", "acme")).toBe(true);
    expect(isAllowedReturnPath("/home/other/billing", "acme")).toBe(false);
    expect(isAllowedReturnPath("https://evil.example/home/acme/billing", "acme")).toBe(false);
    expect(isAllowedReturnPath("/home/acme//evil.example", "acme")).toBe(false);
    expect(isAllowedReturnPath("/home/acme/billing?x=https://evil", "acme")).toBe(false);
    expect(isAllowedReturnPath("/home/acme/", "acme")).toBe(false);
  });

  it("formats business addresses without empty parts", () => {
    expect(formatBusinessAddress({ line1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "United States" })).toBe("1 Main St, Austin, TX 78701, United States");
    expect(formatBusinessAddress(null)).toBe("");
  });
});
