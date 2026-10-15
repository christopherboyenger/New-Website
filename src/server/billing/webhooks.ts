import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { getDb } from "../db/client";
import { billingAccounts, billingProviderState, webhookInbox, type BillingEnvironment } from "../db/schema";
import { env } from "../env";
import { appendLedgerEntry } from "./ledger";
import { STRIPE, providerErrorSummary } from "./provider";
import { SPEND_INVOICE_REF, SUBSCRIPTION_INVOICE_REF } from "./rules";
import { getStripe, stripeKeyEnvironment, verifyStripeSignature, type Stripe } from "./stripe";
import {
  applyInvoicePaymentFailed,
  applyPaymentMethodDetached,
  applySetupIntent,
  applySetupSessionExpired,
  providerId,
  syncSubscription,
  type BillingTenant,
} from "./sync";

/**
 * Stripe webhook ingestion (production-integration-contracts.md §6):
 * 1. verify the signature over the raw body (400 on failure, nothing stored);
 * 2. reject events whose mode differs from the configured key's mode;
 * 3. insert into webhook_inbox (unique provider + environment + event id) —
 *    a duplicate of an already processed/quarantined event returns 200 with
 *    no effect; a duplicate of a failed one is processed again;
 * 4. resolve the tenant only from the stored customer mapping for that mode
 *    (event metadata is never used for routing); unknown → quarantined;
 * 5. apply effects from re-retrieved provider objects with unique effect keys.
 * A processing error is recorded on the inbox row (attempts, last_error) and
 * answered with 500 so the provider retries the delivery.
 */

export const MAX_WEBHOOK_BYTES = 512 * 1024;

export interface WebhookResponse {
  status: number;
  body: Record<string, unknown>;
}

type ProcessResult = "processed" | "quarantined";

/** Event types this endpoint acts on; every other verified event is stored and acknowledged. */
export const handledStripeEvents = [
  "checkout.session.completed",
  "checkout.session.expired",
  "setup_intent.succeeded",
  "setup_intent.setup_failed",
  "setup_intent.requires_action",
  "payment_method.detached",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<WebhookResponse> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) return { status: 503, body: { error: "Payment webhooks are not configured." } };
  if (!signature) return { status: 400, body: { error: "Missing signature." } };
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) return { status: 413, body: { error: "Payload too large." } };

  let event: Stripe.Event;
  try {
    event = verifyStripeSignature(rawBody, signature, secret);
  } catch {
    return { status: 400, body: { error: "Invalid signature." } };
  }

  const environment: BillingEnvironment = event.livemode ? "live" : "test";
  const keyEnvironment = stripeKeyEnvironment();
  if (keyEnvironment && keyEnvironment !== environment) return { status: 400, body: { error: "Event mode does not match this deployment." } };

  const db = await getDb();
  let inboxId: string;
  try {
    const [inserted] = await db
      .insert(webhookInbox)
      .values({
        id: newId("whk"),
        provider: STRIPE,
        environment,
        eventId: event.id,
        eventType: event.type,
        payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
        payload: JSON.parse(rawBody) as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: [webhookInbox.provider, webhookInbox.environment, webhookInbox.eventId] })
      .returning({ id: webhookInbox.id });
    if (inserted) {
      inboxId = inserted.id;
    } else {
      const [existing] = await db
        .select({ id: webhookInbox.id, status: webhookInbox.status })
        .from(webhookInbox)
        .where(and(eq(webhookInbox.provider, STRIPE), eq(webhookInbox.environment, environment), eq(webhookInbox.eventId, event.id)))
        .limit(1);
      if (existing.status === "processed" || existing.status === "quarantined") return { status: 200, body: { received: true, duplicate: true } };
      inboxId = existing.id;
    }
  } catch (error) {
    console.error("[billing] webhook inbox unavailable:", providerErrorSummary(error));
    return { status: 503, body: { error: "Temporarily unavailable." } };
  }

  const [row] = await db.select({ attempts: webhookInbox.attempts }).from(webhookInbox).where(eq(webhookInbox.id, inboxId)).limit(1);
  const attempts = (row?.attempts ?? 0) + 1;
  try {
    const result = await processStripeEvent(event, environment);
    await db
      .update(webhookInbox)
      .set({ status: result, attempts, lastError: result === "quarantined" ? "unmapped_customer" : null, processedAt: new Date() })
      .where(eq(webhookInbox.id, inboxId));
    return { status: 200, body: { received: true, ...(result === "quarantined" ? { quarantined: true } : {}) } };
  } catch (error) {
    const summary = providerErrorSummary(error);
    console.error("[billing] webhook processing failed:", event.type, summary);
    await db.update(webhookInbox).set({ status: "failed", attempts, lastError: summary }).where(eq(webhookInbox.id, inboxId));
    return { status: 500, body: { error: "Processing failed; the delivery will be retried." } };
  }
}

/** Tenant from the stored customer mapping for this mode — never from event metadata. */
async function resolveTenant(customerId: string | null, environment: BillingEnvironment): Promise<BillingTenant | null> {
  if (!customerId) return null;
  const db = await getDb();
  const [row] = await db
    .select({ orgId: billingAccounts.orgId })
    .from(billingAccounts)
    .innerJoin(billingProviderState, eq(billingProviderState.orgId, billingAccounts.orgId))
    .where(and(eq(billingAccounts.providerCustomerId, customerId), eq(billingProviderState.environment, environment)))
    .limit(1);
  return row ? { orgId: row.orgId, customerId, environment } : null;
}

function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw Object.assign(new Error("Payments are not configured."), { name: "PaymentsNotConfigured" });
  return stripe;
}

async function processStripeEvent(event: Stripe.Event, environment: BillingEnvironment): Promise<ProcessResult> {
  if (!(handledStripeEvents as readonly string[]).includes(event.type)) return "processed";
  const object = event.data.object as unknown as Record<string, unknown> & { id: string };

  // payment_method.detached carries the former customer only in previous_attributes.
  const customerRef =
    event.type === "payment_method.detached"
      ? ((event.data.previous_attributes as { customer?: string | { id: string } } | undefined)?.customer ?? null)
      : (object.customer as string | { id: string } | null | undefined);
  const tenant = await resolveTenant(providerId(customerRef), environment);
  if (!tenant) return "quarantined";

  const quarantineOnMismatch = (outcome: string): ProcessResult => (outcome === "mismatch" ? "quarantined" : "processed");

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const stripe = requireStripe();
      if (session.mode === "setup") {
        const setupIntentId = providerId(session.setup_intent);
        return setupIntentId ? quarantineOnMismatch(await applySetupIntent(tenant, setupIntentId, stripe)) : "processed";
      }
      if (session.mode === "subscription") {
        const subscriptionId = providerId(session.subscription);
        return subscriptionId ? quarantineOnMismatch(await syncSubscription(tenant, subscriptionId, stripe)) : "processed";
      }
      return "processed";
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      if (session.mode === "setup") await applySetupSessionExpired(tenant, session.id);
      return "processed";
    }
    case "setup_intent.succeeded":
    case "setup_intent.setup_failed":
    case "setup_intent.requires_action":
      return quarantineOnMismatch(await applySetupIntent(tenant, event.data.object.id, requireStripe()));
    case "payment_method.detached":
      await applyPaymentMethodDetached(tenant, event.data.object.id);
      return "processed";
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return quarantineOnMismatch(await syncSubscription(tenant, event.data.object.id, requireStripe()));
    case "invoice.paid": {
      const invoice = event.data.object;
      if (invoice.amount_paid <= 0) return "processed";
      const subscriptionInvoice = (invoice.billing_reason ?? "").startsWith("subscription");
      const paidAt = invoice.status_transitions?.paid_at ?? event.created;
      await appendLedgerEntry({
        orgId: tenant.orgId,
        account: "cash_charge",
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
        occurredAt: new Date(paidAt * 1000),
        effectKey: `stripe:${environment}:invoice:${invoice.id}:paid`,
        description: subscriptionInvoice ? "Plan subscription payment" : "Campaign spend charge",
        refType: subscriptionInvoice ? SUBSCRIPTION_INVOICE_REF : SPEND_INVOICE_REF,
        refId: invoice.id,
      });
      return "processed";
    }
    case "invoice.payment_failed":
      return quarantineOnMismatch(await applyInvoicePaymentFailed(tenant, event.data.object.id, requireStripe()));
    default:
      return "processed";
  }
}
