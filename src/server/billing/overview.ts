import "server-only";
import { eq } from "drizzle-orm";
import { commercialPolicy, planDisplayName } from "@/config/commercial-policy";
import type { DateRange } from "@/domain/date-range";
import { hasPermission, type OrgContext } from "../authz";
import { getDb } from "../db/client";
import { billingAccounts, billingSubscriptions, type PlanId } from "../db/schema";
import { env } from "../env";
import { capability } from "../readiness";
import { businessInformationOf, businessRevision, type BusinessInformation } from "./commands";
import { ledgerTotals, listLedgerEntries, type LedgerPage } from "./ledger";
import { getPaymentReadiness, type PaymentReadiness } from "./payment-setup";
import { getProviderState } from "./provider";
import { activityAccounts, creditRemainingCents, currentBalanceCents, planGrantingStatuses, type ActivityTab } from "./rules";
import { stripeKeyEnvironment } from "./stripe";

/** Everything the Billing page renders, read for an actor who holds `billing:view`. */
export interface BillingOverview {
  plan: { id: PlanId; name: string; endsAtPeriodEnd: boolean; hasManagedSubscription: boolean };
  thresholdCents: number;
  thresholdOptionsCents: readonly number[];
  settingsVersion: number;
  balanceCents: number;
  /** Null when the matching promotion is disabled by policy (nothing is shown). */
  matchingCreditRemainingCents: number | null;
  payment: PaymentReadiness;
  business: { info: BusinessInformation; revision: string };
  readiness: {
    payments: { configured: boolean; detail: string };
    webhooks: { configured: boolean; detail: string };
    upgrade: { configured: boolean };
  };
  canManage: boolean;
  activity: LedgerPage & { tab: ActivityTab; range: DateRange };
}

export const ACTIVITY_PAGE_SIZE = 20;

export async function loadBillingOverview(ctx: OrgContext, opts: { tab: ActivityTab; range: DateRange; page: number }): Promise<BillingOverview> {
  const orgId = ctx.org.id;
  const [account, totals, payment, activity, subscriptions, state] = await Promise.all([
    getDb().then((db) => db.select().from(billingAccounts).where(eq(billingAccounts.orgId, orgId)).limit(1)).then((rows) => rows[0] ?? null),
    ledgerTotals(orgId),
    getPaymentReadiness(orgId),
    listLedgerEntries(orgId, { accounts: activityAccounts[opts.tab], range: opts.range, page: opts.page, pageSize: ACTIVITY_PAGE_SIZE }),
    getDb().then((db) =>
      db
        .select({ status: billingSubscriptions.status, cancelAtPeriodEnd: billingSubscriptions.cancelAtPeriodEnd })
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.orgId, orgId)),
    ),
    getProviderState(orgId),
  ]);
  const payments = capability("payments");
  const webhooks = capability("payment_webhooks");
  const granting = subscriptions.filter((s) => planGrantingStatuses.has(s.status));
  const info = businessInformationOf(account);

  return {
    plan: {
      id: ctx.org.planId,
      name: planDisplayName(ctx.org.planId),
      endsAtPeriodEnd: granting.length > 0 && granting.every((s) => s.cancelAtPeriodEnd),
      hasManagedSubscription: subscriptions.length > 0 && Boolean(account?.providerCustomerId) && state?.environment === stripeKeyEnvironment(),
    },
    thresholdCents: ctx.org.billingThresholdCents,
    thresholdOptionsCents: commercialPolicy.billingThresholdOptionsCents,
    settingsVersion: ctx.org.version,
    balanceCents: currentBalanceCents(totals),
    matchingCreditRemainingCents: commercialPolicy.matchingCredit.enabled ? creditRemainingCents(totals, "matching_credit") : null,
    payment,
    business: { info, revision: businessRevision(info) },
    readiness: {
      payments: { configured: payments.configured, detail: payments.detail },
      webhooks: { configured: webhooks.configured, detail: webhooks.detail },
      upgrade: { configured: payments.configured && Boolean(env().STRIPE_UNLIMITED_PRICE_ID) },
    },
    canManage: hasPermission(ctx, "billing:manage"),
    activity: { ...activity, tab: opts.tab, range: opts.range },
  };
}
