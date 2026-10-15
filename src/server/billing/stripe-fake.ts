/**
 * Test-only stand-in for the Stripe API client (never imported by
 * application code). Each resource method is a vi.fn whose results tests
 * configure; `objects` holds provider-side state returned by retrieve calls.
 */
import { vi } from "vitest";
import type { Stripe } from "./stripe";

export interface FakeStripeState {
  setupIntents: Map<string, Record<string, unknown>>;
  paymentMethods: Map<string, Record<string, unknown>>;
  subscriptions: Map<string, Record<string, unknown>>;
  invoices: Map<string, Record<string, unknown>>;
  sessions: Map<string, Record<string, unknown>>;
}

function retrieveFrom(map: Map<string, Record<string, unknown>>, kind: string) {
  return vi.fn(async (id: string) => {
    const object = map.get(id);
    if (!object) throw Object.assign(new Error(`No such ${kind}`), { type: "StripeInvalidRequestError", code: "resource_missing" });
    return structuredClone(object);
  });
}

export function createFakeStripe() {
  const state: FakeStripeState = {
    setupIntents: new Map(),
    paymentMethods: new Map(),
    subscriptions: new Map(),
    invoices: new Map(),
    sessions: new Map(),
  };
  let sessionSeq = 0;
  const fake = {
    customers: {
      // Typed with (params, opts) so tests can inspect the idempotency key passed as the second argument.
      create: vi.fn(async (...args: [params: unknown, opts?: unknown]) => {
        void args;
        return { id: "cus_fake_1", object: "customer" };
      }),
      update: vi.fn(async (id: string) => ({ id, object: "customer" })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async (...[params]: [params: Record<string, unknown>, opts?: unknown]) => {
          const id = `cs_test_${++sessionSeq}`;
          const session = { id, object: "checkout.session", status: "open", url: `https://checkout.stripe.test/${id}`, ...params };
          state.sessions.set(id, session);
          return session;
        }),
        retrieve: retrieveFrom(state.sessions, "checkout session"),
        expire: vi.fn(async (id: string) => {
          const session = state.sessions.get(id);
          if (session) session.status = "expired";
          return session;
        }),
      },
    },
    setupIntents: { retrieve: retrieveFrom(state.setupIntents, "setup intent") },
    paymentMethods: { retrieve: retrieveFrom(state.paymentMethods, "payment method") },
    subscriptions: { retrieve: retrieveFrom(state.subscriptions, "subscription") },
    invoices: { retrieve: retrieveFrom(state.invoices, "invoice") },
    billingPortal: { sessions: { create: vi.fn(async () => ({ id: "bps_1", url: "https://billing.stripe.test/session" })) } },
  };
  return { stripe: fake as unknown as Stripe, fake, state };
}
