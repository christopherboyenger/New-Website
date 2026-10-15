import "server-only";
import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { addDays, type DateRange } from "@/domain/date-range";
import { newId } from "@/lib/ids";
import { getDb, type DbLike } from "../db/client";
import { ledgerEntries, type LedgerAccount } from "../db/schema";
import { creditAccounts, emptyLedgerTotals, SUBSCRIPTION_INVOICE_REF, type LedgerTotals } from "./rules";

/**
 * Append-only billing ledger (production-integration-contracts.md §6).
 * Entries are never updated or deleted; a correction is a new entry that
 * references the original. Every entry carries a unique business-effect key,
 * so a duplicate webhook, job or retry can never create a second effect.
 * Only server processes (webhooks, jobs) append; there is no UI write path.
 */

export type LedgerEntry = typeof ledgerEntries.$inferSelect;

export interface NewLedgerEntry {
  orgId: string;
  account: LedgerAccount;
  /** Signed integer cents. */
  amountCents: number;
  currency?: string;
  occurredAt: Date;
  effectKey: string;
  description: string;
  refType?: string | null;
  refId?: string | null;
  correctsEntryId?: string | null;
}

export class LedgerEffectConflictError extends Error {
  constructor(effectKey: string) {
    super(`Ledger effect ${effectKey} already exists with different values.`);
    this.name = "LedgerEffectConflictError";
  }
}

/**
 * Appends an entry unless its effect key already exists. Returns the stored
 * entry and whether this call created it. Reusing an effect key for a
 * different org, account or amount is a programming error and throws.
 */
export async function appendLedgerEntry(entry: NewLedgerEntry, tx?: DbLike): Promise<{ entry: LedgerEntry; created: boolean }> {
  if (!Number.isSafeInteger(entry.amountCents)) throw new Error("Ledger amounts must be integer cents.");
  if (!entry.effectKey.trim()) throw new Error("Ledger entries need an effect key.");
  const db = tx ?? (await getDb());
  const inserted = await db
    .insert(ledgerEntries)
    .values({
      id: newId("led"),
      orgId: entry.orgId,
      account: entry.account,
      amountCents: entry.amountCents,
      currency: entry.currency ?? "usd",
      occurredAt: entry.occurredAt,
      effectKey: entry.effectKey,
      description: entry.description,
      refType: entry.refType ?? null,
      refId: entry.refId ?? null,
      correctsEntryId: entry.correctsEntryId ?? null,
    })
    .onConflictDoNothing({ target: ledgerEntries.effectKey })
    .returning();
  if (inserted[0]) return { entry: inserted[0], created: true };

  const [existing] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.effectKey, entry.effectKey)).limit(1);
  if (!existing || existing.orgId !== entry.orgId || existing.account !== entry.account || existing.amountCents !== entry.amountCents) {
    throw new LedgerEffectConflictError(entry.effectKey);
  }
  return { entry: existing, created: false };
}

/** Per-account totals used for the balance and credit figures (one grouped query). */
export async function ledgerTotals(orgId: string): Promise<LedgerTotals> {
  const db = await getDb();
  const rows = await db
    .select({
      account: ledgerEntries.account,
      positive: sql<string>`coalesce(sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.amountCents} > 0), 0)`,
      negative: sql<string>`coalesce(sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.amountCents} < 0), 0)`,
      spendCharges: sql<string>`coalesce(sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.refType} is distinct from ${SUBSCRIPTION_INVOICE_REF}), 0)`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.orgId, orgId))
    .groupBy(ledgerEntries.account);

  const totals = emptyLedgerTotals();
  for (const row of rows) {
    const positive = Number(row.positive);
    const negative = Number(row.negative);
    if (row.account === "campaign_spend") totals.campaignSpendCents = positive + negative;
    else if (row.account === "cash_charge") totals.spendChargesCents = Number(row.spendCharges);
    else if ((creditAccounts as readonly string[]).includes(row.account)) {
      totals.credits[row.account as (typeof creditAccounts)[number]] = { grantedCents: positive, appliedCents: -negative };
    }
  }
  return totals;
}

export interface LedgerPage {
  rows: Array<Pick<LedgerEntry, "id" | "account" | "amountCents" | "currency" | "occurredAt" | "description" | "refType">>;
  total: number;
  page: number;
  pageSize: number;
}

/** Entries of the given accounts whose occurrence falls on the UTC days of `range`, newest first. */
export async function listLedgerEntries(
  orgId: string,
  opts: { accounts: readonly LedgerAccount[]; range: DateRange; page: number; pageSize: number },
): Promise<LedgerPage> {
  const db = await getDb();
  const where = and(
    eq(ledgerEntries.orgId, orgId),
    inArray(ledgerEntries.account, [...opts.accounts]),
    gte(ledgerEntries.occurredAt, new Date(`${opts.range.from}T00:00:00.000Z`)),
    lt(ledgerEntries.occurredAt, new Date(`${addDays(opts.range.to, 1)}T00:00:00.000Z`)),
  );
  const [{ value: total }] = await db.select({ value: count() }).from(ledgerEntries).where(where);
  const lastPage = Math.max(1, Math.ceil(total / opts.pageSize));
  const page = Math.min(Math.max(1, opts.page), lastPage);
  const rows = await db
    .select({
      id: ledgerEntries.id,
      account: ledgerEntries.account,
      amountCents: ledgerEntries.amountCents,
      currency: ledgerEntries.currency,
      occurredAt: ledgerEntries.occurredAt,
      description: ledgerEntries.description,
      refType: ledgerEntries.refType,
    })
    .from(ledgerEntries)
    .where(where)
    .orderBy(desc(ledgerEntries.occurredAt), desc(ledgerEntries.recordedAt))
    .limit(opts.pageSize)
    .offset((page - 1) * opts.pageSize);
  return { rows, total, page, pageSize: opts.pageSize };
}
