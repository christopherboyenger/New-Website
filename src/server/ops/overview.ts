import "server-only";
import { count, eq, min } from "drizzle-orm";
import { getDb } from "../db/client";
import { organizations, posts } from "../db/schema";
import { earningPolicyConfigured } from "./earnings";
import { leadCounts } from "./leads";
import type { OperatorContext } from "./operator";
import { webhookIssueCounts } from "./webhooks";

export interface OpsOverview {
  review: { submitted: number; oldestSubmittedAt: Date | null };
  webhooks: { quarantined: number; failed: number };
  leads: { total: number; last7Days: number };
  workspaces: number;
  earningsConfigured: boolean;
}

export async function loadOpsOverview(operator: OperatorContext, now = new Date()): Promise<OpsOverview> {
  const db = await getDb();
  const [[review], webhooks, leads, [orgs]] = await Promise.all([
    db.select({ n: count(), oldest: min(posts.submittedAt) }).from(posts).where(eq(posts.reviewStatus, "submitted")),
    webhookIssueCounts(operator),
    leadCounts(operator, now),
    db.select({ n: count() }).from(organizations),
  ]);
  return {
    review: { submitted: review.n, oldestSubmittedAt: review.oldest ? new Date(review.oldest) : null },
    webhooks,
    leads,
    workspaces: orgs.n,
    earningsConfigured: earningPolicyConfigured(),
  };
}
