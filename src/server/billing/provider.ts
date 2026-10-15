import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import type { CommandContext } from "../authz";
import { getDb, type DbLike } from "../db/client";
import { billingAccounts, billingProviderState, providerOperations, type BillingEnvironment } from "../db/schema";
import { stripeKeyEnvironment, type Stripe } from "./stripe";

/**
 * Tenant ↔ provider mapping and outbound command bookkeeping.
 *
 * - The provider customer for an organization is created here, server-side,
 *   with an idempotency key derived from the org id and key mode, and stored on
 *   billing_accounts. A customer ID is never accepted from a client.
 * - Every outbound provider command is recorded in provider_operations before
 *   the call (intent), then marked succeeded/failed with external IDs.
 */

export const STRIPE = "stripe";

export type BillingAccountRow = typeof billingAccounts.$inferSelect;
export type ProviderStateRow = typeof billingProviderState.$inferSelect;

/** The org's billing profile row, created on first use (organizations created before billing existed). */
export async function ensureBillingAccount(orgId: string, tx?: DbLike): Promise<BillingAccountRow> {
  const db = tx ?? (await getDb());
  await db.insert(billingAccounts).values({ orgId }).onConflictDoNothing({ target: billingAccounts.orgId });
  const [row] = await db.select().from(billingAccounts).where(eq(billingAccounts.orgId, orgId)).limit(1);
  return row;
}

export async function getProviderState(orgId: string, tx?: DbLike): Promise<ProviderStateRow | null> {
  const db = tx ?? (await getDb());
  const [row] = await db.select().from(billingProviderState).where(eq(billingProviderState.orgId, orgId)).limit(1);
  return row ?? null;
}

export async function updateProviderState(
  orgId: string,
  environment: BillingEnvironment,
  patch: Partial<Pick<ProviderStateRow, "providerPaymentMethodId" | "lastSetupSessionId" | "lastUpgradeSessionId">>,
  tx?: DbLike,
): Promise<void> {
  const db = tx ?? (await getDb());
  await db
    .insert(billingProviderState)
    .values({ orgId, environment, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({ target: billingProviderState.orgId, set: { ...patch, updatedAt: new Date() } });
}

/* ----------------------------------------------------------------------------
 * Provider operations (outbound command intent + outcome)
 * ------------------------------------------------------------------------- */

function paramsDigest(params: unknown): string {
  return createHash("sha256").update(JSON.stringify(params)).digest("hex");
}

/** Records the intent of an outbound call; returns the row id (an existing one when the key was already recorded). */
export async function recordOperation(orgId: string, operation: string, idempotencyKey: string, params: unknown): Promise<string> {
  const db = await getDb();
  const [inserted] = await db
    .insert(providerOperations)
    .values({ id: newId("pop"), orgId, provider: STRIPE, operation, idempotencyKey, paramsSha256: paramsDigest(params), stage: "recorded" })
    .onConflictDoNothing({ target: [providerOperations.provider, providerOperations.idempotencyKey] })
    .returning({ id: providerOperations.id });
  if (inserted) return inserted.id;
  const [existing] = await db
    .select({ id: providerOperations.id })
    .from(providerOperations)
    .where(and(eq(providerOperations.provider, STRIPE), eq(providerOperations.idempotencyKey, idempotencyKey)))
    .limit(1);
  return existing.id;
}

export async function completeOperation(id: string, externalIds: Record<string, string>): Promise<void> {
  const db = await getDb();
  const [row] = await db.select({ attempts: providerOperations.attempts }).from(providerOperations).where(eq(providerOperations.id, id)).limit(1);
  await db
    .update(providerOperations)
    .set({ stage: "succeeded", externalIds, attempts: (row?.attempts ?? 0) + 1, lastError: null, updatedAt: new Date() })
    .where(eq(providerOperations.id, id));
}

export async function failOperation(id: string, error: unknown): Promise<void> {
  const db = await getDb();
  const [row] = await db.select({ attempts: providerOperations.attempts }).from(providerOperations).where(eq(providerOperations.id, id)).limit(1);
  await db
    .update(providerOperations)
    .set({ stage: "failed", attempts: (row?.attempts ?? 0) + 1, lastError: providerErrorSummary(error), updatedAt: new Date() })
    .where(eq(providerOperations.id, id));
}

/** Error category for logs/records: provider error type and code only, never request payloads. */
export function providerErrorSummary(error: unknown): string {
  const e = error as { type?: unknown; code?: unknown; name?: unknown } | null;
  const parts = [e?.type, e?.code].filter((p): p is string => typeof p === "string");
  if (parts.length) return parts.join(":").slice(0, 200);
  return typeof e?.name === "string" ? e.name.slice(0, 200) : "unknown_error";
}

/** Latest recorded external id of an operation kind for an org (e.g. last setup session). */
export async function latestOperation(orgId: string, operation: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(providerOperations)
    .where(and(eq(providerOperations.orgId, orgId), eq(providerOperations.provider, STRIPE), eq(providerOperations.operation, operation)))
    .orderBy(desc(providerOperations.createdAt))
    .limit(1);
  return row ?? null;
}

/* ----------------------------------------------------------------------------
 * Customer mapping
 * ------------------------------------------------------------------------- */

export interface ProviderCustomer {
  customerId: string;
  environment: BillingEnvironment;
}

/**
 * Resolves (creating when needed) the provider customer for the authorized
 * org. The mapping is keyed by the configured key mode: a customer created
 * with test keys is never reused with live keys.
 */
export async function ensureProviderCustomer(ctx: CommandContext, stripe: Stripe): Promise<ProviderCustomer> {
  const environment = stripeKeyEnvironment() ?? "test";
  const account = await ensureBillingAccount(ctx.org.id);
  const state = await getProviderState(ctx.org.id);
  if (account.providerCustomerId && state?.environment === environment) return { customerId: account.providerCustomerId, environment };

  const idempotencyKey = `customer_create:${ctx.org.id}:${environment}`;
  const params = { metadata: { org_id: ctx.org.id } };
  const opId = await recordOperation(ctx.org.id, "customer_create", idempotencyKey, params);
  let customer: Stripe.Customer;
  try {
    customer = await stripe.customers.create({ ...params, name: ctx.org.name }, { idempotencyKey });
  } catch (error) {
    await failOperation(opId, error);
    throw error;
  }
  await completeOperation(opId, { customerId: customer.id });

  const db = await getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(billingAccounts).where(eq(billingAccounts.orgId, ctx.org.id)).for("update").limit(1);
    const [currentState] = await tx.select().from(billingProviderState).where(eq(billingProviderState.orgId, ctx.org.id)).limit(1);
    // A concurrent request may already have stored the mapping for this mode; keep the first one.
    if (current?.providerCustomerId && currentState?.environment === environment) return { customerId: current.providerCustomerId, environment };
    // A customer from the other key mode carries no usable card in this mode.
    const switchedMode = Boolean(current?.providerCustomerId);
    await tx
      .update(billingAccounts)
      .set({
        providerCustomerId: customer.id,
        ...(switchedMode ? { paymentMethodStatus: "none" as const, paymentMethodBrand: null, paymentMethodLast4: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(billingAccounts.orgId, ctx.org.id));
    await tx
      .insert(billingProviderState)
      .values({ orgId: ctx.org.id, environment, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: billingProviderState.orgId,
        set: { environment, providerPaymentMethodId: null, lastSetupSessionId: null, lastUpgradeSessionId: null, updatedAt: new Date() },
      });
    return { customerId: customer.id, environment };
  });
}

