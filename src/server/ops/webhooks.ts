import "server-only";
import { count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { getDb } from "../db/client";
import { webhookInbox } from "../db/schema";
import type { OperatorContext } from "./operator";
import { clampPage, OPS_PAGE_SIZE, type Page } from "./pagination";

export const webhookIssueStatuses = ["quarantined", "failed"] as const;
export type WebhookIssueStatus = (typeof webhookIssueStatuses)[number];
export type WebhookIssueFilter = WebhookIssueStatus | "all";

/** Only identifiers and diagnostics: never the payload (it may carry customer or secret data). */
export interface WebhookIssue {
  id: string;
  provider: string;
  environment: string;
  eventId: string;
  eventType: string;
  receivedAt: Date;
  status: WebhookIssueStatus;
  attempts: number;
  lastError: string | null;
}

const ERROR_PREVIEW_MAX = 240;

export function parseWebhookFilter(value: string | string[] | undefined): WebhookIssueFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "quarantined" || raw === "failed" ? raw : "all";
}

function filterWhere(filter: WebhookIssueFilter): SQL {
  return filter === "all" ? inArray(webhookInbox.status, [...webhookIssueStatuses]) : eq(webhookInbox.status, filter);
}

export async function webhookIssueCounts(operator: OperatorContext): Promise<Record<WebhookIssueStatus, number>> {
  void operator;
  const db = await getDb();
  const rows = await db
    .select({ status: webhookInbox.status, n: count() })
    .from(webhookInbox)
    .where(inArray(webhookInbox.status, [...webhookIssueStatuses]))
    .groupBy(webhookInbox.status);
  const counts: Record<WebhookIssueStatus, number> = { quarantined: 0, failed: 0 };
  for (const r of rows) if (r.status === "quarantined" || r.status === "failed") counts[r.status] = r.n;
  return counts;
}

/** Quarantined/failed inbound webhooks, newest first. Read-only. */
export async function listWebhookIssues(operator: OperatorContext, filter: WebhookIssueFilter, requestedPage: number): Promise<Page<WebhookIssue>> {
  void operator;
  const db = await getDb();
  const where = filterWhere(filter);
  const [{ total }] = await db.select({ total: count() }).from(webhookInbox).where(where);
  const page = clampPage(requestedPage, total);
  const rows = total
    ? await db
        .select({
          id: webhookInbox.id,
          provider: webhookInbox.provider,
          environment: webhookInbox.environment,
          eventId: webhookInbox.eventId,
          eventType: webhookInbox.eventType,
          receivedAt: webhookInbox.receivedAt,
          status: webhookInbox.status,
          attempts: webhookInbox.attempts,
          lastError: webhookInbox.lastError,
        })
        .from(webhookInbox)
        .where(where)
        .orderBy(desc(webhookInbox.receivedAt), desc(webhookInbox.id))
        .limit(OPS_PAGE_SIZE)
        .offset((page - 1) * OPS_PAGE_SIZE)
    : [];
  return {
    rows: rows.map((r) => ({
      ...r,
      status: r.status as WebhookIssueStatus,
      lastError: r.lastError === null ? null : r.lastError.length > ERROR_PREVIEW_MAX ? `${r.lastError.slice(0, ERROR_PREVIEW_MAX)}…` : r.lastError,
    })),
    total,
    page,
    pageSize: OPS_PAGE_SIZE,
  };
}
