import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { site } from "@/config/site";
import { newId } from "@/lib/ids";
import { recordAudit } from "../audit";
import type { CommandContext } from "../authz";
import { getDb } from "../db/client";
import { billingAccounts, billingSubscriptions, type PaymentMethodStatus } from "../db/schema";
import { env } from "../env";
import {
  completeOperation,
  ensureBillingAccount,
  ensureProviderCustomer,
  failOperation,
  getProviderState,
  providerErrorSummary,
  recordOperation,
  updateProviderState,
} from "./provider";
import { isAllowedReturnPath, planGrantingStatuses } from "./rules";
import { getStripe, stripeKeyEnvironment } from "./stripe";
import { applySetupIntent, providerId } from "./sync";

/**
 * Provider-hosted billing flows (Stripe Checkout). Card details never touch
 * this application: setup and upgrade happen on the provider's hosted page,
 * and the browser's return only ever shows "being confirmed" — the stored
 * state changes when the provider confirms it (webhook or a server-side
 * reconciliation that retrieves the provider object).
 *
 * Consumers: onboarding payment step, playbook publishing gate, Billing page.
 * Callers must already have checked `billing:manage` (start/upgrade/portal)
 * or `billing:view` (readiness/reconcile) for the actor.
 */

export type PaymentSetupStart =
  | { status: "redirect"; url: string }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

export interface PaymentReadiness {
  status: PaymentMethodStatus;
  brand: string | null;
  last4: string | null;
}

const NOT_CONFIGURED = "Card payments are not configured on this deployment yet, so a card can't be added.";
const PROVIDER_ERROR = "The payment provider couldn't start a secure session. Nothing was charged. Try again in a moment.";
const SESSION_TTL_SECONDS = 60 * 60;

function absoluteUrl(path: string, query: Record<string, string>): string {
  const url = new URL(path, site.appUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Starts card setup on a hosted Checkout page (setup mode — nothing is
 * charged). Returns to `returnPath?setup=returned`. An earlier unfinished
 * setup session is expired first, so only one can complete.
 */
export async function startPaymentMethodSetup(ctx: CommandContext, opts: { returnPath: string }): Promise<PaymentSetupStart> {
  const stripe = getStripe();
  if (!stripe) return { status: "not_configured", message: NOT_CONFIGURED };
  if (!isAllowedReturnPath(opts.returnPath, ctx.org.slug)) return { status: "error", message: "That return page isn't allowed for payment setup." };

  let opId: string | null = null;
  try {
    const customer = await ensureProviderCustomer(ctx, stripe);
    const state = await getProviderState(ctx.org.id);
    if (state?.lastSetupSessionId && state.environment === customer.environment) {
      try {
        const previous = await stripe.checkout.sessions.retrieve(state.lastSetupSessionId);
        if (previous.status === "open") await stripe.checkout.sessions.expire(previous.id);
      } catch (error) {
        // Best effort: if both sessions complete, the later provider confirmation is the card on file.
        console.error("[billing] could not expire previous setup session:", providerErrorSummary(error));
      }
    }

    const attempt = newId("pop");
    const idempotencyKey = `checkout_setup:${attempt}`;
    const params = {
      mode: "setup" as const,
      customer: customer.customerId,
      currency: "usd",
      payment_method_types: ["card"],
      client_reference_id: ctx.org.id,
      success_url: absoluteUrl(opts.returnPath, { setup: "returned" }),
      cancel_url: absoluteUrl(opts.returnPath, { setup: "canceled" }),
      expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    };
    opId = await recordOperation(ctx.org.id, "checkout_setup", idempotencyKey, params);
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey });
    if (!session.url) throw new Error("Checkout session has no URL");
    await completeOperation(opId, { sessionId: session.id });

    await updateProviderState(ctx.org.id, customer.environment, { lastSetupSessionId: session.id });
    const db = await getDb();
    // A card that is already confirmed stays usable while a replacement is set up.
    await db
      .update(billingAccounts)
      .set({ paymentMethodStatus: "pending", updatedAt: new Date() })
      .where(and(eq(billingAccounts.orgId, ctx.org.id), inArray(billingAccounts.paymentMethodStatus, ["none", "failed", "requires_action", "pending"])));
    await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "billing.payment_setup.started", targetType: "billing_account", targetId: ctx.org.id });
    return { status: "redirect", url: session.url };
  } catch (error) {
    if (opId) await failOperation(opId, error);
    console.error("[billing] payment setup start failed:", providerErrorSummary(error));
    return { status: "error", message: PROVIDER_ERROR };
  }
}

/** Payment readiness from stored provider-confirmed state (never from a browser redirect). */
export async function getPaymentReadiness(orgId: string): Promise<PaymentReadiness> {
  const db = await getDb();
  const [row] = await db.select().from(billingAccounts).where(eq(billingAccounts.orgId, orgId)).limit(1);
  return { status: row?.paymentMethodStatus ?? "none", brand: row?.paymentMethodBrand ?? null, last4: row?.paymentMethodLast4 ?? null };
}

/**
 * Asks the provider for the latest card-setup session's outcome and applies
 * it (the same effect a webhook would have). Used by "Check again" when a
 * status stays pending, e.g. while webhooks are delayed.
 */
export async function reconcilePaymentSetup(ctx: CommandContext): Promise<PaymentReadiness> {
  const stripe = getStripe();
  const account = await ensureBillingAccount(ctx.org.id);
  const state = await getProviderState(ctx.org.id);
  const keyEnvironment = stripeKeyEnvironment();
  if (!stripe || !account.providerCustomerId || !state?.lastSetupSessionId || state.environment !== keyEnvironment) {
    return getPaymentReadiness(ctx.org.id);
  }
  const tenant = { orgId: ctx.org.id, customerId: account.providerCustomerId, environment: state.environment };
  const session = await stripe.checkout.sessions.retrieve(state.lastSetupSessionId);
  if (providerId(session.customer) === tenant.customerId) {
    const setupIntentId = providerId(session.setup_intent);
    if (session.status === "complete" && setupIntentId) {
      await applySetupIntent(tenant, setupIntentId, stripe);
    } else if (session.status === "expired" && account.paymentMethodStatus === "pending") {
      const db = await getDb();
      await db
        .update(billingAccounts)
        .set({ paymentMethodStatus: "none", updatedAt: new Date() })
        .where(and(eq(billingAccounts.orgId, ctx.org.id), eq(billingAccounts.paymentMethodStatus, "pending")));
    }
  }
  return getPaymentReadiness(ctx.org.id);
}

export type PlanUpgradeStart = PaymentSetupStart | { status: "already_subscribed"; message: string };

/** Unlimited upgrade on a hosted Checkout subscription page. The plan changes only when the provider confirms the subscription. */
export async function startPlanUpgrade(ctx: CommandContext): Promise<PlanUpgradeStart> {
  const stripe = getStripe();
  const priceId = env().STRIPE_UNLIMITED_PRICE_ID;
  if (!stripe || !priceId) return { status: "not_configured", message: "Plan upgrades are not configured on this deployment yet." };
  if (ctx.org.planId === "unlimited") return { status: "already_subscribed", message: "This workspace is already on Unlimited." };

  const db = await getDb();
  const live = await db
    .select({ status: billingSubscriptions.status })
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.orgId, ctx.org.id));
  if (live.some((s) => planGrantingStatuses.has(s.status))) {
    return { status: "already_subscribed", message: "A subscription for this workspace is already active and is being confirmed." };
  }

  let opId: string | null = null;
  try {
    const customer = await ensureProviderCustomer(ctx, stripe);
    const attempt = newId("pop");
    const idempotencyKey = `checkout_upgrade:${attempt}`;
    const billingPath = `/home/${ctx.org.slug}/billing`;
    const params = {
      mode: "subscription" as const,
      customer: customer.customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: ctx.org.id,
      success_url: absoluteUrl(billingPath, { upgrade: "returned" }),
      cancel_url: absoluteUrl(billingPath, { upgrade: "canceled" }),
      expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    };
    opId = await recordOperation(ctx.org.id, "checkout_upgrade", idempotencyKey, params);
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey });
    if (!session.url) throw new Error("Checkout session has no URL");
    await completeOperation(opId, { sessionId: session.id });
    await updateProviderState(ctx.org.id, customer.environment, { lastUpgradeSessionId: session.id });
    await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "billing.upgrade.started", targetType: "organization", targetId: ctx.org.id });
    return { status: "redirect", url: session.url };
  } catch (error) {
    if (opId) await failOperation(opId, error);
    console.error("[billing] upgrade start failed:", providerErrorSummary(error));
    return { status: "error", message: PROVIDER_ERROR };
  }
}

/** Provider-hosted subscription management (change or cancel the plan) for an existing customer. */
export async function startPlanManagement(ctx: CommandContext): Promise<PaymentSetupStart> {
  const stripe = getStripe();
  if (!stripe) return { status: "not_configured", message: "Plan management is not configured on this deployment yet." };
  const account = await ensureBillingAccount(ctx.org.id);
  const state = await getProviderState(ctx.org.id);
  if (!account.providerCustomerId || state?.environment !== stripeKeyEnvironment()) {
    return { status: "error", message: "There is no subscription to manage for this workspace yet." };
  }
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: account.providerCustomerId,
      return_url: absoluteUrl(`/home/${ctx.org.slug}/billing`, { plan: "returned" }),
    });
    await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "billing.portal.opened", targetType: "organization", targetId: ctx.org.id });
    return { status: "redirect", url: session.url };
  } catch (error) {
    console.error("[billing] portal start failed:", providerErrorSummary(error));
    return { status: "error", message: PROVIDER_ERROR };
  }
}
