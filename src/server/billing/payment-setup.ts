import "server-only";
import { eq } from "drizzle-orm";
import type { CommandContext } from "../authz";
import { getDb } from "../db/client";
import { billingAccounts, type PaymentMethodStatus } from "../db/schema";
import { env } from "../env";

/**
 * STUB with the final public interface — the billing area implements the
 * provider-hosted setup flow (Stripe Checkout in setup mode) behind it.
 * Consumers: onboarding payment step, Billing page.
 * Callers must already have checked `billing:manage` for the actor.
 */
export type PaymentSetupStart =
  | { status: "redirect"; url: string }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

export async function startPaymentMethodSetup(ctx: CommandContext, opts: { returnPath: string }): Promise<PaymentSetupStart> {
  void ctx;
  void opts;
  if (!env().STRIPE_SECRET_KEY) {
    return { status: "not_configured", message: "Card payments are not configured on this deployment yet, so a card can't be added." };
  }
  return { status: "error", message: "Payment setup is not available yet." };
}

export interface PaymentReadiness {
  status: PaymentMethodStatus;
  brand: string | null;
  last4: string | null;
}

/** Payment readiness from stored provider-confirmed state (never from a browser redirect). */
export async function getPaymentReadiness(orgId: string): Promise<PaymentReadiness> {
  const db = await getDb();
  const [row] = await db.select().from(billingAccounts).where(eq(billingAccounts.orgId, orgId)).limit(1);
  return { status: row?.paymentMethodStatus ?? "none", brand: row?.paymentMethodBrand ?? null, last4: row?.paymentMethodLast4 ?? null };
}
