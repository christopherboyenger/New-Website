import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/support/db";
import { makeOrg } from "../../../tests/support/factories";
import { appendLedgerEntry, LedgerEffectConflictError, ledgerTotals, listLedgerEntries } from "./ledger";
import { creditRemainingCents, currentBalanceCents } from "./rules";

const day = (d: string) => new Date(`${d}T12:00:00.000Z`);

describe("billing ledger", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it("creates one effect per effect key", async () => {
    const { org } = await makeOrg();
    const entry = { orgId: org.id, account: "cash_charge" as const, amountCents: 2500, occurredAt: day("2026-10-01"), effectKey: "stripe:test:invoice:in_1:paid", description: "Charge" };
    const first = await appendLedgerEntry(entry);
    const second = await appendLedgerEntry(entry);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    const page = await listLedgerEntries(org.id, { accounts: ["cash_charge"], range: { from: "2026-10-01", to: "2026-10-01" }, page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
  });

  it("refuses to reuse an effect key for a different effect", async () => {
    const { org } = await makeOrg();
    const base = { orgId: org.id, account: "cash_charge" as const, amountCents: 2500, occurredAt: day("2026-10-01"), effectKey: "k1", description: "Charge" };
    await appendLedgerEntry(base);
    await expect(appendLedgerEntry({ ...base, amountCents: 9999 })).rejects.toBeInstanceOf(LedgerEffectConflictError);
  });

  it("rejects non-integer amounts", async () => {
    const { org } = await makeOrg();
    await expect(appendLedgerEntry({ orgId: org.id, account: "cash_charge", amountCents: 10.5, occurredAt: new Date(), effectKey: "k2", description: "x" })).rejects.toThrow();
  });

  it("computes balance and credits per account, per tenant", async () => {
    const { org } = await makeOrg();
    const { org: other } = await makeOrg();
    const add = (orgId: string, account: Parameters<typeof appendLedgerEntry>[0]["account"], amountCents: number, key: string, refType?: string) =>
      appendLedgerEntry({ orgId, account, amountCents, occurredAt: day("2026-10-02"), effectKey: key, description: key, refType });
    await add(org.id, "campaign_spend", 7000, "s1");
    await add(org.id, "cash_charge", 5000, "c1", "stripe_invoice");
    await add(org.id, "cash_charge", 9900, "c2", "stripe_subscription_invoice");
    await add(org.id, "matching_credit", 50000, "m1");
    await add(org.id, "matching_credit", -1000, "m2");
    await add(other.id, "campaign_spend", 123456, "o1");

    const totals = await ledgerTotals(org.id);
    // 7000 spend − 5000 charged − 1000 credit applied; the subscription payment does not reduce it.
    expect(currentBalanceCents(totals)).toBe(1000);
    expect(creditRemainingCents(totals, "matching_credit")).toBe(49000);

    const empty = await ledgerTotals((await makeOrg()).org.id);
    expect(currentBalanceCents(empty)).toBe(0);
  });

  it("lists entries for UTC days of the range, newest first, paginated", async () => {
    const { org } = await makeOrg();
    for (const [i, d] of ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"].entries()) {
      await appendLedgerEntry({ orgId: org.id, account: "cash_charge", amountCents: 100 * (i + 1), occurredAt: day(d), effectKey: `k${i}`, description: d });
    }
    await appendLedgerEntry({ orgId: org.id, account: "cash_charge", amountCents: 1, occurredAt: new Date("2026-10-02T23:59:59.999Z"), effectKey: "edge", description: "edge" });
    const page1 = await listLedgerEntries(org.id, { accounts: ["cash_charge"], range: { from: "2026-10-01", to: "2026-10-02" }, page: 1, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows.map((r) => r.description)).toEqual(["edge", "2026-10-02"]);
    const page2 = await listLedgerEntries(org.id, { accounts: ["cash_charge"], range: { from: "2026-10-01", to: "2026-10-02" }, page: 2, pageSize: 2 });
    expect(page2.rows.map((r) => r.description)).toEqual(["2026-10-01"]);
    const credits = await listLedgerEntries(org.id, { accounts: ["matching_credit"], range: { from: "2026-10-01", to: "2026-10-02" }, page: 1, pageSize: 2 });
    expect(credits.total).toBe(0);
  });
});
