import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { createTestDb } from "../../../tests/support/db";
import { makeOrg } from "../../../tests/support/factories";
import { getDb } from "../db/client";
import { billingAccounts, billingProviderState, ledgerEntries, organizations, webhookInbox } from "../db/schema";
import { resetEnvForTesting } from "../env";
import { createFakeStripe } from "./stripe-fake";
import { setStripeForTesting } from "./stripe";
import { handleStripeWebhook } from "./webhooks";

const SECRET = "whsec_test_secret";
const ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_UNLIMITED_PRICE_ID"] as const;

let seq = 0;
function event(type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { id: `evt_${++seq}`, object: "event", type, livemode: false, created: 1_760_000_000, api_version: Stripe.API_VERSION, data: { object }, ...extra };
}

async function deliver(payload: Record<string, unknown>, secret = SECRET) {
  const body = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return handleStripeWebhook(body, header);
}

async function mapCustomer(orgId: string, customerId = "cus_1", environment: "test" | "live" = "test") {
  const db = await getDb();
  await db.insert(billingAccounts).values({ orgId, providerCustomerId: customerId }).onConflictDoUpdate({ target: billingAccounts.orgId, set: { providerCustomerId: customerId } });
  await db.insert(billingProviderState).values({ orgId, environment }).onConflictDoNothing();
}

async function account(orgId: string) {
  const db = await getDb();
  const [row] = await db.select().from(billingAccounts).where(eq(billingAccounts.orgId, orgId));
  return row;
}

async function inboxRows() {
  const db = await getDb();
  return db.select().from(webhookInbox);
}

describe("Stripe webhook", () => {
  let fake: ReturnType<typeof createFakeStripe>;

  beforeEach(async () => {
    await createTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_UNLIMITED_PRICE_ID = "price_unlimited";
    resetEnvForTesting();
    fake = createFakeStripe();
    setStripeForTesting(fake.stripe);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    resetEnvForTesting();
    setStripeForTesting(null);
  });

  it("rejects an invalid signature with 400 and stores nothing", async () => {
    const result = await deliver(event("invoice.paid", { id: "in_1", customer: "cus_1" }), "whsec_wrong");
    expect(result.status).toBe(400);
    expect(await inboxRows()).toHaveLength(0);

    const missing = await handleStripeWebhook("{}", null);
    expect(missing.status).toBe(400);
  });

  it("answers 503 (retriable) when the signing secret is not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    resetEnvForTesting();
    const result = await deliver(event("invoice.paid", { id: "in_1" }));
    expect(result.status).toBe(503);
    expect(await inboxRows()).toHaveLength(0);
  });

  it("rejects an event whose mode differs from the configured key", async () => {
    const result = await deliver(event("invoice.paid", { id: "in_1", customer: "cus_1" }, { livemode: true }));
    expect(result.status).toBe(400);
    expect(await inboxRows()).toHaveLength(0);
  });

  it("marks the payment method ready with brand and last4 after a completed setup session", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id);
    fake.state.setupIntents.set("seti_1", {
      id: "seti_1",
      customer: "cus_1",
      status: "succeeded",
      last_setup_error: null,
      payment_method: { id: "pm_1", customer: "cus_1", type: "card", card: { brand: "visa", last4: "4242" } },
    });

    const result = await deliver(event("checkout.session.completed", { id: "cs_1", object: "checkout.session", mode: "setup", customer: "cus_1", setup_intent: "seti_1" }));
    expect(result.status).toBe(200);
    const row = await account(org.id);
    expect(row).toMatchObject({ paymentMethodStatus: "ready", paymentMethodBrand: "visa", paymentMethodLast4: "4242" });
    expect(fake.fake.customers.update).toHaveBeenCalledWith("cus_1", { invoice_settings: { default_payment_method: "pm_1" } });
    const [inbox] = await inboxRows();
    expect(inbox).toMatchObject({ status: "processed", attempts: 1, provider: "stripe", environment: "test" });
  });

  it("applies a duplicate delivery only once", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id);
    const paid = event("invoice.paid", {
      id: "in_1",
      object: "invoice",
      customer: "cus_1",
      amount_paid: 2500,
      currency: "usd",
      billing_reason: "manual",
      status_transitions: { paid_at: 1_760_000_100 },
    });

    expect((await deliver(paid)).status).toBe(200);
    const second = await deliver(paid);
    expect(second).toEqual({ status: 200, body: { received: true, duplicate: true } });

    const db = await getDb();
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.orgId, org.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ account: "cash_charge", amountCents: 2500, refId: "in_1", refType: "stripe_invoice" });
    expect(await inboxRows()).toHaveLength(1);
  });

  it("never applies the same invoice twice even from two different events", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id);
    const invoice = { id: "in_2", object: "invoice", customer: "cus_1", amount_paid: 9900, currency: "usd", billing_reason: "subscription_create" };
    await deliver(event("invoice.paid", invoice));
    await deliver(event("invoice.paid", invoice));
    const db = await getDb();
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.orgId, org.id));
    expect(entries).toHaveLength(1);
    expect(entries[0].refType).toBe("stripe_subscription_invoice");
  });

  it("quarantines events for unknown customers without effects", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id, "cus_known");
    const result = await deliver(event("invoice.paid", { id: "in_3", customer: "cus_unknown", amount_paid: 1000, currency: "usd" }));
    expect(result).toEqual({ status: 200, body: { received: true, quarantined: true } });
    const [inbox] = await inboxRows();
    expect(inbox.status).toBe("quarantined");
    const db = await getDb();
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  it("never routes by metadata.org_id alone", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id, "cus_real");
    fake.state.setupIntents.set("seti_x", {
      id: "seti_x",
      customer: "cus_attacker",
      status: "succeeded",
      payment_method: { id: "pm_x", customer: "cus_attacker", type: "card", card: { brand: "visa", last4: "0000" } },
    });
    const result = await deliver(
      event("checkout.session.completed", {
        id: "cs_x",
        mode: "setup",
        customer: "cus_attacker",
        setup_intent: "seti_x",
        client_reference_id: org.id,
        metadata: { org_id: org.id },
      }),
    );
    expect(result.status).toBe(200);
    expect((await inboxRows())[0].status).toBe("quarantined");
    expect(fake.fake.setupIntents.retrieve).not.toHaveBeenCalled();
    expect((await account(org.id)).paymentMethodStatus).toBe("none");
  });

  it("does not route a customer mapped in the other key mode", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id, "cus_1", "live");
    const result = await deliver(event("invoice.paid", { id: "in_4", customer: "cus_1", amount_paid: 1000, currency: "usd" }));
    expect(result.body).toMatchObject({ quarantined: true });
  });

  it("resolves out-of-order subscription events to the provider's latest state", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id);
    const db = await getDb();
    const plan = async () => (await db.select({ planId: organizations.planId }).from(organizations).where(eq(organizations.id, org.id)))[0].planId;
    const sub = (status: string) => ({ id: "sub_1", object: "subscription", customer: "cus_1", status, cancel_at_period_end: false, items: { data: [{ price: { id: "price_unlimited" } }] } });

    // Provider truth: the subscription was created and later canceled. "deleted" arrives before "created".
    fake.state.subscriptions.set("sub_1", sub("canceled"));
    await deliver(event("customer.subscription.deleted", sub("canceled")));
    await deliver(event("customer.subscription.created", sub("active")));
    expect(await plan()).toBe("basic");

    // Provider truth: active again (resubscribed); a stale "deleted" payload must not downgrade.
    fake.state.subscriptions.set("sub_1", sub("active"));
    await deliver(event("customer.subscription.updated", sub("active")));
    expect(await plan()).toBe("unlimited");
    await deliver(event("customer.subscription.deleted", sub("canceled")));
    expect(await plan()).toBe("unlimited");
  });

  it("downgrades to basic when the provider reports the subscription canceled", async () => {
    const { org } = await makeOrg({ planId: "unlimited" });
    await mapCustomer(org.id);
    const canceled = { id: "sub_2", customer: "cus_1", status: "canceled", cancel_at_period_end: false, items: { data: [{ price: { id: "price_unlimited" } }] } };
    fake.state.subscriptions.set("sub_2", canceled);
    await deliver(event("customer.subscription.deleted", canceled));
    const db = await getDb();
    const [row] = await db.select({ planId: organizations.planId }).from(organizations).where(eq(organizations.id, org.id));
    expect(row.planId).toBe("basic");
  });

  it("records processing errors with attempts, answers 500, and succeeds on redelivery", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id);
    const completed = event("checkout.session.completed", { id: "cs_2", mode: "setup", customer: "cus_1", setup_intent: "seti_missing" });
    const first = await deliver(completed);
    expect(first.status).toBe(500);
    let [inbox] = await inboxRows();
    expect(inbox).toMatchObject({ status: "failed", attempts: 1 });
    expect(inbox.lastError).toBe("StripeInvalidRequestError:resource_missing");

    fake.state.setupIntents.set("seti_missing", {
      id: "seti_missing",
      customer: "cus_1",
      status: "succeeded",
      payment_method: { id: "pm_2", customer: "cus_1", type: "card", card: { brand: "mastercard", last4: "4444" } },
    });
    const retry = await deliver(completed);
    expect(retry.status).toBe(200);
    [inbox] = await inboxRows();
    expect(inbox).toMatchObject({ status: "processed", attempts: 2 });
    expect((await account(org.id)).paymentMethodLast4).toBe("4444");
  });

  it("clears the card when the confirmed payment method is detached", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id);
    const db = await getDb();
    await db.update(billingAccounts).set({ paymentMethodStatus: "ready", paymentMethodBrand: "visa", paymentMethodLast4: "4242" }).where(eq(billingAccounts.orgId, org.id));
    await db.update(billingProviderState).set({ providerPaymentMethodId: "pm_1" }).where(eq(billingProviderState.orgId, org.id));

    // A different card being detached changes nothing.
    await deliver(event("payment_method.detached", { id: "pm_other", customer: null }, { data: { object: { id: "pm_other", customer: null }, previous_attributes: { customer: "cus_1" } } }));
    expect((await account(org.id)).paymentMethodStatus).toBe("ready");

    await deliver(event("payment_method.detached", { id: "pm_1", customer: null }, { data: { object: { id: "pm_1", customer: null }, previous_attributes: { customer: "cus_1" } } }));
    expect(await account(org.id)).toMatchObject({ paymentMethodStatus: "none", paymentMethodBrand: null, paymentMethodLast4: null });
  });

  it("marks payment failed unless the provider shows the invoice paid since", async () => {
    const { org } = await makeOrg();
    await mapCustomer(org.id);
    fake.state.invoices.set("in_5", { id: "in_5", customer: "cus_1", status: "paid" });
    await deliver(event("invoice.payment_failed", { id: "in_5", customer: "cus_1" }));
    expect((await account(org.id)).paymentMethodStatus).toBe("none");

    fake.state.invoices.set("in_6", { id: "in_6", customer: "cus_1", status: "open" });
    await deliver(event("invoice.payment_failed", { id: "in_6", customer: "cus_1" }));
    expect((await account(org.id)).paymentMethodStatus).toBe("failed");
  });

  it("acknowledges unhandled event types without effects", async () => {
    const result = await deliver(event("customer.created", { id: "cus_9" }));
    expect(result.status).toBe(200);
    expect((await inboxRows())[0].status).toBe("processed");
  });
});
