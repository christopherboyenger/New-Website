import "server-only";
import { count, desc, gte } from "drizzle-orm";
import { getDb } from "../db/client";
import { leads } from "../db/schema";
import type { OperatorContext } from "./operator";
import { clampPage, OPS_PAGE_SIZE, type Page } from "./pagination";

export interface LeadRow {
  id: string;
  email: string;
  companyName: string;
  budgetBand: string | null;
  ctaSource: string | null;
  stepReached: number;
  createdAt: Date;
}

/** Acquisition leads, newest first. Read-only. */
export async function listLeads(operator: OperatorContext, requestedPage: number): Promise<Page<LeadRow>> {
  void operator;
  const db = await getDb();
  const [{ total }] = await db.select({ total: count() }).from(leads);
  const page = clampPage(requestedPage, total);
  const rows = total
    ? await db
        .select({
          id: leads.id,
          email: leads.email,
          companyName: leads.companyName,
          budgetBand: leads.budgetBand,
          ctaSource: leads.ctaSource,
          stepReached: leads.stepReached,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .orderBy(desc(leads.createdAt), desc(leads.id))
        .limit(OPS_PAGE_SIZE)
        .offset((page - 1) * OPS_PAGE_SIZE)
    : [];
  return { rows, total, page, pageSize: OPS_PAGE_SIZE };
}

export async function leadCounts(operator: OperatorContext, now = new Date()): Promise<{ total: number; last7Days: number }> {
  void operator;
  const db = await getDb();
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [[all], [recent]] = await Promise.all([
    db.select({ n: count() }).from(leads),
    db.select({ n: count() }).from(leads).where(gte(leads.createdAt, since)),
  ]);
  return { total: all.n, last7Days: recent.n };
}
