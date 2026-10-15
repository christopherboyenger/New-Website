import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/support/db";
import { addMember, makeOrg } from "../../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../../tests/support/request-context";
import { getDb } from "../db/client";
import { billingAccounts, billingProviderState, providerOperations } from "../db/schema";
import { resetEnvForTesting } from "../env";
import { beginPaymentMethodSetup, beginPlanUpgrade, refreshPaymentStatus } from "./commands";
import { getPaymentReadiness, startPaymentMethodSetup, startPlanUpgrade } from "./payment-setup";
import { createFakeStripe } from "./stripe-fake";
import { setStripeForTesting } from "./stripe";

const ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_UNLIMITED_PRICE_ID", "NEXT_PUBLIC_APP_URL"] as const;

function configure(vars: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, vars);
  resetEnvForTesting();
}

async function account(orgId: string) {
  const db = await getDb();
  const [row] = await db.select().from(billingAccounts).where(eq(billingAccounts.orgId, orgId));
  return row;
}

describe("payment setup", () => {
  let fake: ReturnType<typeof createFakeStripe>;

  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
    configure({ STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_UNLIMITED_PRICE_ID: "price_unlimited" });
    fake = createFakeStripe();
    setStripeForTesting(fake.stripe);
  });

  afterEach(() => {
    configure({});
    setStripeForTesting(null);
  });

  it("reports not_configured without a secret key and calls nothing", async () => {
    configure({});
    setStripeForTesting(null);
    const { org, owner } = await makeOrg();
    const result = await startPaymentMethodSetup({ org, user: owner }, { returnPath: `/home/${org.slug}/billing` });
    expect(result.status).toBe("not_configured");
    const upgrade = await startPlanUpgrade({ org, user: owner });
    expect(upgrade.status).toBe("not_configured");
  });

  it("creates the customer server-side once and starts a setup-mode session with allowlisted return URLs", async () => {
    const { org, owner } = await makeOrg();
    const result = await startPaymentMethodSetup({ org, user: owner }, { returnPath: `/home/${org.slug}/billing` });
    expect(result).toEqual({ status: "redirect", url: "https://checkout.stripe.test/cs_test_1" });

    expect(fake.fake.customers.create).toHaveBeenCalledTimes(1);
    expect(fake.fake.customers.create.mock.calls[0][1]).toEqual({ idempotencyKey: `customer_create:${org.id}:test` });
    const params = fake.fake.checkout.sessions.create.mock.calls[0][0];
    expect(params).toMatchObject({ mode: "setup", customer: "cus_fake_1" });
    expect(new URL(String(params.success_url)).pathname).toBe(`/home/${org.slug}/billing`);
    expect(new URL(String(params.success_url)).searchParams.get("setup")).toBe("returned");

    expect(await account(org.id)).toMatchObject({ providerCustomerId: "cus_fake_1", paymentMethodStatus: "pending" });
    const db = await getDb();
    const [state] = await db.select().from(billingProviderState).where(eq(billingProviderState.orgId, org.id));
    expect(state).toMatchObject({ environment: "test", lastSetupSessionId: "cs_test_1" });
    const ops = await db.select().from(providerOperations).where(eq(providerOperations.orgId, org.id));
    expect(ops.map((o) => [o.operation, o.stage]).sort()).toEqual([
      ["checkout_setup", "succeeded"],
      ["customer_create", "succeeded"],
    ]);

    // A second attempt reuses the stored customer and expires the unfinished session first.
    await startPaymentMethodSetup({ org, user: owner }, { returnPath: "/onboarding" });
    expect(fake.fake.customers.create).toHaveBeenCalledTimes(1);
    expect(fake.fake.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_1");
  });

  it("refuses return paths outside the allowlist", async () => {
    const { org, owner } = await makeOrg();
    for (const returnPath of ["https://evil.example/billing", "//evil.example", "/home/other-org/billing", "/auth/sign-in"]) {
      const result = await startPaymentMethodSetup({ org, user: owner }, { returnPath });
      expect(result.status).toBe("error");
    }
    expect(fake.fake.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("never takes a customer id from the client", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const db = await getDb();
    await db.insert(billingAccounts).values({ orgId: org.id, providerCustomerId: "cus_stored" });
    await db.insert(billingProviderState).values({ orgId: org.id, environment: "test" });

    // Extra arguments a client might send are not part of the action's interface and are ignored.
    const call = beginPaymentMethodSetup as unknown as (slug: string, extra: unknown) => ReturnType<typeof beginPaymentMethodSetup>;
    const result = await call(org.slug, { customer: "cus_attacker", customerId: "cus_attacker" });
    expect(result.ok && result.data.status).toBe("redirect");
    expect(fake.fake.checkout.sessions.create.mock.calls[0][0]).toMatchObject({ customer: "cus_stored" });
    expect(fake.fake.customers.create).not.toHaveBeenCalled();
  });

  it("forbids members at the action layer with no provider call", async () => {
    const { org } = await makeOrg();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    const setup = await beginPaymentMethodSetup(org.slug);
    expect(setup).toMatchObject({ ok: false, code: "forbidden" });
    const upgrade = await beginPlanUpgrade(org.slug);
    expect(upgrade).toMatchObject({ ok: false, code: "forbidden" });
    const status = await refreshPaymentStatus(org.slug);
    expect(status).toMatchObject({ ok: false, code: "forbidden" });
    expect(fake.fake.customers.create).not.toHaveBeenCalled();
    expect(fake.fake.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("treats another workspace's slug as not found", async () => {
    const { org: other } = await makeOrg();
    const { owner } = await makeOrg();
    await signInAs(owner.id);
    const result = await beginPaymentMethodSetup(other.slug);
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(fake.fake.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("keeps a confirmed card ready while a replacement is being set up", async () => {
    const { org, owner } = await makeOrg();
    const db = await getDb();
    await db.insert(billingAccounts).values({ orgId: org.id, providerCustomerId: "cus_stored", paymentMethodStatus: "ready", paymentMethodBrand: "visa", paymentMethodLast4: "4242" });
    await db.insert(billingProviderState).values({ orgId: org.id, environment: "test" });
    await startPaymentMethodSetup({ org, user: owner }, { returnPath: `/home/${org.slug}/billing` });
    expect((await getPaymentReadiness(org.id)).status).toBe("ready");
  });

  it("reconciles a pending setup from the provider session (not from the browser return)", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    await startPaymentMethodSetup({ org, user: owner }, { returnPath: `/home/${org.slug}/billing` });
    expect((await getPaymentReadiness(org.id)).status).toBe("pending");

    // Still open at the provider: stays pending.
    let result = await refreshPaymentStatus(org.slug);
    expect(result.ok && result.data.status).toBe("pending");

    const session = fake.state.sessions.get("cs_test_1")!;
    session.status = "complete";
    session.setup_intent = "seti_1";
    fake.state.setupIntents.set("seti_1", { id: "seti_1", customer: "cus_fake_1", status: "succeeded", payment_method: "pm_1" });
    fake.state.paymentMethods.set("pm_1", { id: "pm_1", customer: "cus_fake_1", type: "card", card: { brand: "visa", last4: "1881" } });
    result = await refreshPaymentStatus(org.slug);
    expect(result.ok && result.data).toEqual({ status: "ready", brand: "visa", last4: "1881" });
  });

  it("returns an expired, unfinished setup to none", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    await startPaymentMethodSetup({ org, user: owner }, { returnPath: `/home/${org.slug}/billing` });
    fake.state.sessions.get("cs_test_1")!.status = "expired";
    const result = await refreshPaymentStatus(org.slug);
    expect(result.ok && result.data.status).toBe("none");
  });

  it("starts an Unlimited subscription checkout for basic workspaces only", async () => {
    const { org, owner } = await makeOrg();
    const result = await startPlanUpgrade({ org, user: owner });
    expect(result.status).toBe("redirect");
    expect(fake.fake.checkout.sessions.create.mock.calls[0][0]).toMatchObject({ mode: "subscription", line_items: [{ price: "price_unlimited", quantity: 1 }] });

    const { org: unlimited, owner: owner2 } = await makeOrg({ planId: "unlimited" });
    expect((await startPlanUpgrade({ org: unlimited, user: owner2 })).status).toBe("already_subscribed");
  });

  it("reports upgrades as not configured without a price id", async () => {
    configure({ STRIPE_SECRET_KEY: "sk_test_fake" });
    const { org, owner } = await makeOrg();
    expect((await startPlanUpgrade({ org, user: owner })).status).toBe("not_configured");
  });

  it("reports provider failures as errors and records the failed operation", async () => {
    const { org, owner } = await makeOrg();
    fake.fake.checkout.sessions.create.mockRejectedValueOnce(Object.assign(new Error("boom"), { type: "StripeAPIError" }));
    const result = await startPaymentMethodSetup({ org, user: owner }, { returnPath: `/home/${org.slug}/billing` });
    expect(result.status).toBe("error");
    const db = await getDb();
    const [op] = await db.select().from(providerOperations).where(eq(providerOperations.operation, "checkout_setup"));
    expect(op).toMatchObject({ stage: "failed", lastError: "StripeAPIError" });
    expect((await getPaymentReadiness(org.id)).status).toBe("none");
  });
});
