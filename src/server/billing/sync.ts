import "server-only";
import { and, eq } from "drizzle-orm";
import { recordAudit } from "../audit";
import { getDb } from "../db/client";
import { billingAccounts, billingSubscriptions, organizations, type BillingEnvironment } from "../db/schema";
import { env } from "../env";
import { ensureBillingAccount, getProviderState, updateProviderState } from "./provider";
import { normalizeSubscriptionStatus, paymentStatusFromSetupIntent, planFromSubscriptions } from "./rules";
import type { Stripe } from "./stripe";

/**
 * Applies provider truth to stored billing state. Every function here
 * re-retrieves the provider object instead of trusting an event payload or a
 * browser return, so duplicate and out-of-order deliveries converge on the
 * provider's current state. Callers pass a tenant already resolved from the
 * stored customer mapping.
 */

export interface BillingTenant {
  orgId: string;
  customerId: string;
  environment: BillingEnvironment;
}

export type SyncOutcome = "applied" | "unchanged" | "mismatch";

export function providerId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** Card setup result → payment-method status (+ brand/last4 when confirmed). */
export async function applySetupIntent(tenant: BillingTenant, setupIntentId: string, stripe: Stripe): Promise<SyncOutcome> {
  const intent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
  if (providerId(intent.customer) !== tenant.customerId) return "mismatch";
  const next = paymentStatusFromSetupIntent(intent.status, Boolean(intent.last_setup_error));
  if (!next) return "unchanged";

  const account = await ensureBillingAccount(tenant.orgId);
  if (next !== "ready") {
    // A failed or unfinished attempt to replace a card never hides a card that is still confirmed.
    if (account.paymentMethodStatus === "ready" || account.paymentMethodStatus === next) return "unchanged";
    await setPaymentStatus(tenant.orgId, { paymentMethodStatus: next });
    return "applied";
  }

  const method =
    typeof intent.payment_method === "string" ? await stripe.paymentMethods.retrieve(intent.payment_method) : intent.payment_method;
  // Detached since the setup completed (or never attached): nothing to confirm.
  if (!method || providerId(method.customer) !== tenant.customerId) return "unchanged";

  const brand = method.card?.brand ?? method.type;
  const last4 = method.card?.last4 ?? null;
  const state = await getProviderState(tenant.orgId);
  const same =
    account.paymentMethodStatus === "ready" && state?.providerPaymentMethodId === method.id && account.paymentMethodBrand === brand && account.paymentMethodLast4 === last4;
  if (!same) {
    await setPaymentStatus(tenant.orgId, { paymentMethodStatus: "ready", paymentMethodBrand: brand, paymentMethodLast4: last4 });
    await updateProviderState(tenant.orgId, tenant.environment, { providerPaymentMethodId: method.id });
    await recordAudit({ orgId: tenant.orgId, actorUserId: null, action: "billing.payment_method.confirmed", targetType: "billing_account", targetId: tenant.orgId, data: { brand } });
  }
  // Threshold charges are made off-session against the customer's default method.
  await stripe.customers.update(tenant.customerId, { invoice_settings: { default_payment_method: method.id } });
  return same ? "unchanged" : "applied";
}

/** The confirmed card was removed at the provider. */
export async function applyPaymentMethodDetached(tenant: BillingTenant, paymentMethodId: string): Promise<SyncOutcome> {
  const state = await getProviderState(tenant.orgId);
  if (state?.providerPaymentMethodId !== paymentMethodId) return "unchanged";
  await setPaymentStatus(tenant.orgId, { paymentMethodStatus: "none", paymentMethodBrand: null, paymentMethodLast4: null });
  await updateProviderState(tenant.orgId, tenant.environment, { providerPaymentMethodId: null });
  await recordAudit({ orgId: tenant.orgId, actorUserId: null, action: "billing.payment_method.removed", targetType: "billing_account", targetId: tenant.orgId });
  return "applied";
}

/** A card setup session ended without completing: a pending status goes back to "none". */
export async function applySetupSessionExpired(tenant: BillingTenant, sessionId: string): Promise<SyncOutcome> {
  const state = await getProviderState(tenant.orgId);
  if (state?.lastSetupSessionId !== sessionId) return "unchanged";
  const db = await getDb();
  const rows = await db
    .update(billingAccounts)
    .set({ paymentMethodStatus: "none", updatedAt: new Date() })
    .where(and(eq(billingAccounts.orgId, tenant.orgId), eq(billingAccounts.paymentMethodStatus, "pending")))
    .returning({ orgId: billingAccounts.orgId });
  return rows.length ? "applied" : "unchanged";
}

/** A charge failed: the card on file needs attention, unless the invoice has since been paid. */
export async function applyInvoicePaymentFailed(tenant: BillingTenant, invoiceId: string, stripe: Stripe): Promise<SyncOutcome> {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (providerId(invoice.customer) !== tenant.customerId) return "mismatch";
  if (invoice.status === "paid" || invoice.status === "void") return "unchanged";
  const account = await ensureBillingAccount(tenant.orgId);
  if (account.paymentMethodStatus === "failed") return "unchanged";
  await setPaymentStatus(tenant.orgId, { paymentMethodStatus: "failed" });
  await recordAudit({ orgId: tenant.orgId, actorUserId: null, action: "billing.payment.failed", targetType: "invoice", targetId: invoiceId });
  return "applied";
}

/**
 * Stores the provider's current subscription state and recomputes the plan
 * from every stored subscription of the org.
 */
export async function syncSubscription(tenant: BillingTenant, subscriptionId: string, stripe: Stripe): Promise<SyncOutcome> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (providerId(subscription.customer) !== tenant.customerId) return "mismatch";
  const status = normalizeSubscriptionStatus(subscription.status);
  const priceIds = subscription.items.data.map((item) => item.price.id);
  const db = await getDb();
  await db
    .insert(billingSubscriptions)
    .values({ providerSubscriptionId: subscription.id, orgId: tenant.orgId, environment: tenant.environment, status, priceIds, cancelAtPeriodEnd: subscription.cancel_at_period_end, syncedAt: new Date() })
    .onConflictDoUpdate({
      target: billingSubscriptions.providerSubscriptionId,
      set: { status, priceIds, cancelAtPeriodEnd: subscription.cancel_at_period_end, syncedAt: new Date() },
    });
  return (await recomputePlan(tenant.orgId, tenant.environment)) ? "applied" : "unchanged";
}

/** Sets organizations.plan_id from stored subscriptions; returns whether it changed. */
export async function recomputePlan(orgId: string, environment: BillingEnvironment): Promise<boolean> {
  const db = await getDb();
  const subscriptions = await db
    .select({ status: billingSubscriptions.status, priceIds: billingSubscriptions.priceIds })
    .from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.orgId, orgId), eq(billingSubscriptions.environment, environment)));
  const plan = planFromSubscriptions(subscriptions, env().STRIPE_UNLIMITED_PRICE_ID);
  const [org] = await db.select({ planId: organizations.planId }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org || org.planId === plan) return false;
  // The plan is not a user-edited setting, so the settings version is not bumped (open forms stay valid).
  await db.update(organizations).set({ planId: plan, updatedAt: new Date() }).where(eq(organizations.id, orgId));
  await recordAudit({ orgId, actorUserId: null, action: "billing.plan.changed", targetType: "organization", targetId: orgId, data: { from: org.planId, to: plan } });
  return true;
}

async function setPaymentStatus(orgId: string, patch: Partial<Pick<typeof billingAccounts.$inferInsert, "paymentMethodStatus" | "paymentMethodBrand" | "paymentMethodLast4">>) {
  const db = await getDb();
  await db.update(billingAccounts).set({ ...patch, updatedAt: new Date() }).where(eq(billingAccounts.orgId, orgId));
}
