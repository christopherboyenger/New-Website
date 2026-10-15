/**
 * Extension point for tables owned by the "billing-integrations" feature area.
 * Add new tables here (never edit tables owned by other files); they are
 * picked up by tests and the development schema sync automatically.
 */
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ----------------------------------------------------------------------------
 * Billing (owner: billing area). Tables are prefixed `billing_`.
 * ------------------------------------------------------------------------- */

export const billingEnvironments = ["test", "live"] as const;
export type BillingEnvironment = (typeof billingEnvironments)[number];

/**
 * Provider-side references for an organization's billing profile that the
 * shared `billing_accounts` table has no column for. The provider customer
 * itself is stored on `billing_accounts.provider_customer_id`; `environment`
 * records which key mode created it, so webhooks from the other mode never
 * resolve to this tenant.
 */
export const billingProviderState = pgTable("billing_provider_state", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  environment: text("environment", { enum: billingEnvironments }).notNull(),
  /** Payment method confirmed by the provider (the one shown as brand •••• last4). */
  providerPaymentMethodId: text("provider_payment_method_id"),
  /** Latest hosted card-setup session started from this product. */
  lastSetupSessionId: text("last_setup_session_id"),
  /** Latest hosted plan-upgrade session started from this product. */
  lastUpgradeSessionId: text("last_upgrade_session_id"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const billingSubscriptionStatuses = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;
export type BillingSubscriptionStatus = (typeof billingSubscriptionStatuses)[number];

/**
 * Last provider-confirmed state of each plan subscription. Rows are written
 * only from objects retrieved from the provider, so delivery order of
 * subscription events never decides the plan.
 */
export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    providerSubscriptionId: text("provider_subscription_id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    environment: text("environment", { enum: billingEnvironments }).notNull(),
    status: text("status", { enum: billingSubscriptionStatuses }).notNull(),
    priceIds: text("price_ids").array().notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    syncedAt: ts("synced_at").notNull().defaultNow(),
  },
  (t) => [index("billing_subscriptions_org_idx").on(t.orgId)],
);
