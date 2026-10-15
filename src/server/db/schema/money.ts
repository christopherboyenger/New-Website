import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const paymentMethodStatuses = ["none", "pending", "ready", "requires_action", "failed"] as const;
export type PaymentMethodStatus = (typeof paymentMethodStatuses)[number];

/** One billing profile per organization. Card data never touches this database. */
export const billingAccounts = pgTable("billing_accounts", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** Provider customer reference resolved server-side; never accepted from clients. */
  providerCustomerId: text("provider_customer_id"),
  paymentMethodStatus: text("payment_method_status", { enum: paymentMethodStatuses }).notNull().default("none"),
  paymentMethodBrand: text("payment_method_brand"),
  paymentMethodLast4: text("payment_method_last4"),
  businessName: text("business_name"),
  businessAddress: jsonb("business_address").$type<Record<string, string>>(),
  taxId: text("tax_id"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/**
 * Separate ledger accounts — never mixed (production-requirements.md §2):
 * campaign spend, creator obligations, cash charges, credits, external ad spend, payouts.
 */
export const ledgerAccounts = [
  "campaign_spend",
  "creator_obligation",
  "cash_charge",
  "subscription_credit",
  "matching_credit",
  "validation_credit",
  "external_ad_spend",
  "payout_settlement",
] as const;
export type LedgerAccount = (typeof ledgerAccounts)[number];

/** Immutable entries. Corrections are new entries referencing the original. */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    account: text("account", { enum: ledgerAccounts }).notNull(),
    /** Signed integer cents. */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    occurredAt: ts("occurred_at").notNull(),
    recordedAt: ts("recorded_at").notNull().defaultNow(),
    /** Unique business-effect key: duplicate events/jobs can never create a second effect. */
    effectKey: text("effect_key").notNull(),
    description: text("description").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    correctsEntryId: text("corrects_entry_id"),
  },
  (t) => [uniqueIndex("ledger_effect_key_unique").on(t.effectKey), index("ledger_org_time_idx").on(t.orgId, t.occurredAt)],
);

/** Verified inbound provider webhooks. Receipt dedup is separate from ledger-effect dedup. */
export const webhookInbox = pgTable(
  "webhook_inbox",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    environment: text("environment").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    payloadSha256: text("payload_sha256").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["pending", "processed", "quarantined", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    processedAt: ts("processed_at"),
  },
  (t) => [uniqueIndex("webhook_inbox_event_unique").on(t.provider, t.environment, t.eventId)],
);

/** Outbound provider commands (charges, ad object creation...) with stable idempotency keys. */
export const providerOperations = pgTable(
  "provider_operations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    paramsSha256: text("params_sha256").notNull(),
    stage: text("stage", {
      enum: ["recorded", "submitted", "succeeded", "failed", "reconciliation_required"],
    })
      .notNull()
      .default("recorded"),
    externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("provider_operations_idem_unique").on(t.provider, t.idempotencyKey)],
);
