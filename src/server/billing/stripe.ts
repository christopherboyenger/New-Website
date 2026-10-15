import "server-only";
import Stripe from "stripe";
import { env } from "../env";
import type { BillingEnvironment } from "../db/schema";

/**
 * Server-only Stripe access. The client is built lazily from the environment
 * on first use, so a deployment without payment keys still boots and every
 * money action reports "not configured" instead of failing. The API version is
 * pinned to the installed SDK's default so webhook and API object shapes match
 * the SDK's types.
 */
type GlobalWithStripe = typeof globalThis & { __stripeClient?: { key: string; client: Stripe } | null; __stripeOverride?: Stripe | null };
const globalForStripe = globalThis as GlobalWithStripe;

export const STRIPE_API_VERSION = Stripe.API_VERSION;

/** The Stripe client, or null when STRIPE_SECRET_KEY is not configured. */
export function getStripe(): Stripe | null {
  if (globalForStripe.__stripeOverride) return globalForStripe.__stripeOverride;
  const key = env().STRIPE_SECRET_KEY;
  if (!key) return null;
  const cached = globalForStripe.__stripeClient;
  if (cached && cached.key === key) return cached.client;
  const client = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "creator-platform-billing" },
  });
  globalForStripe.__stripeClient = { key, client };
  return client;
}

/** Key mode of the configured secret key: live keys start with sk_live_/rk_live_. */
export function stripeKeyEnvironment(): BillingEnvironment | null {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) return null;
  return /^(sk|rk)_live_/.test(key) ? "live" : "test";
}

/** Signature verification uses the SDK's static helper so it never depends on an API client. */
export function verifyStripeSignature(rawBody: string, signature: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/** Test hook: replace the client with a stub (null restores the env-based client). */
export function setStripeForTesting(client: Stripe | null): void {
  globalForStripe.__stripeOverride = client;
  globalForStripe.__stripeClient = null;
}

export type { Stripe };
