import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import type { Platform } from "@/domain/campaign";
import { ConflictError } from "../action-result";
import { recordAudit } from "../audit";
import { NotFoundError } from "../authz";
import { getDb, type DbLike } from "../db/client";
import { campaignMemberships, campaigns, creators, organizations, playbooks, posts, socialAccounts } from "../db/schema";
import type { OperatorContext } from "./operator";
import { clampPage, OPS_PAGE_SIZE, type Page } from "./pagination";
import { computeObjectiveChecks, type ObjectiveCheck } from "./review-checks";
import { formatStoredReason, type ReviewDecision } from "./review-reasons";

export interface ReviewQueueItem {
  postId: string;
  org: { id: string; name: string; slug: string };
  campaign: { id: string; name: string; primaryHashtag: string; status: "inactive" | "active" | "paused" } | null;
  creator: { id: string; displayName: string };
  platform: Platform;
  handle: string;
  account: { handle: string; verification: "unverified" | "pending" | "verified" | "failed" } | null;
  url: string;
  caption: string;
  submittedAt: Date;
  playbook: { id: string; name: string; revision: number | null } | null;
  checks: ObjectiveCheck[];
}

function selectReviewRows(db: DbLike) {
  return db
    .select({
      postId: posts.id,
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      primaryHashtag: campaigns.primaryHashtag,
      campaignStatus: campaigns.status,
      targeting: campaigns.targeting,
      approvals: campaigns.approvals,
      creatorId: creators.id,
      creatorName: creators.displayName,
      platform: posts.platform,
      handle: posts.handle,
      url: posts.url,
      caption: posts.caption,
      submittedAt: posts.submittedAt,
      reviewStatus: posts.reviewStatus,
      playbookId: playbooks.id,
      playbookName: playbooks.name,
      playbookRevision: posts.playbookRevision,
      accountHandle: socialAccounts.handle,
      accountVerification: socialAccounts.verification,
      accountCreatorId: socialAccounts.creatorId,
      accountPlatform: socialAccounts.platform,
      admissionStatus: campaignMemberships.status,
    })
    .from(posts)
    .innerJoin(organizations, eq(organizations.id, posts.orgId))
    .innerJoin(creators, eq(creators.id, posts.creatorId))
    // Campaign and playbook must belong to the post's own organization.
    .leftJoin(campaigns, and(eq(campaigns.id, posts.campaignId), eq(campaigns.orgId, posts.orgId)))
    .leftJoin(playbooks, and(eq(playbooks.id, posts.playbookId), eq(playbooks.orgId, posts.orgId)))
    .leftJoin(socialAccounts, eq(socialAccounts.id, posts.socialAccountId))
    .leftJoin(
      campaignMemberships,
      and(eq(campaignMemberships.campaignId, posts.campaignId), eq(campaignMemberships.creatorId, posts.creatorId), eq(campaignMemberships.orgId, posts.orgId)),
    );
}

type ReviewRow = Awaited<ReturnType<ReturnType<typeof selectReviewRows>["where"]>>[number];

function toItem(row: ReviewRow): ReviewQueueItem {
  const campaign =
    row.campaignId && row.campaignName !== null && row.primaryHashtag !== null && row.campaignStatus !== null
      ? { id: row.campaignId, name: row.campaignName, primaryHashtag: row.primaryHashtag, status: row.campaignStatus }
      : null;
  const account =
    row.accountHandle !== null && row.accountVerification !== null && row.accountCreatorId !== null && row.accountPlatform !== null
      ? { handle: row.accountHandle, verification: row.accountVerification, creatorId: row.accountCreatorId, platform: row.accountPlatform }
      : null;
  const checks = computeObjectiveChecks({
    caption: row.caption,
    platform: row.platform,
    campaign:
      campaign && row.targeting && row.approvals
        ? {
            primaryHashtag: campaign.primaryHashtag,
            status: campaign.status,
            targetPlatforms: row.targeting.platforms ?? [],
            requireCreatorApproval: row.approvals.requireCreatorApproval,
          }
        : null,
    admissionStatus: row.admissionStatus,
    account: account ? { verification: account.verification, ownedBySubmitter: account.creatorId === row.creatorId, platform: account.platform } : null,
  });
  return {
    postId: row.postId,
    org: { id: row.orgId, name: row.orgName, slug: row.orgSlug },
    campaign,
    creator: { id: row.creatorId, displayName: row.creatorName },
    platform: row.platform,
    handle: row.handle,
    account: account ? { handle: account.handle, verification: account.verification } : null,
    url: row.url,
    caption: row.caption,
    submittedAt: row.submittedAt,
    playbook: row.playbookId && row.playbookName !== null ? { id: row.playbookId, name: row.playbookName, revision: row.playbookRevision } : null,
    checks,
  };
}

/** Posts awaiting content review across all organizations, oldest submission first. */
export async function listReviewQueue(operator: OperatorContext, requestedPage: number): Promise<Page<ReviewQueueItem>> {
  void operator;
  const db = await getDb();
  const [{ total }] = await db.select({ total: count() }).from(posts).where(eq(posts.reviewStatus, "submitted"));
  const page = clampPage(requestedPage, total);
  const rows = total
    ? await selectReviewRows(db)
        .where(eq(posts.reviewStatus, "submitted"))
        .orderBy(asc(posts.submittedAt), asc(posts.id))
        .limit(OPS_PAGE_SIZE)
        .offset((page - 1) * OPS_PAGE_SIZE)
    : [];
  return { rows: rows.map(toItem), total, page, pageSize: OPS_PAGE_SIZE };
}

export interface ReviewOutcome {
  postId: string;
  status: "approved" | "rejected";
}

/**
 * Records an operator's approve/reject decision on a submitted post.
 * Only a post still in `submitted` can be decided: a repeated or concurrent
 * decision changes nothing and raises ConflictError, so each post gets exactly
 * one decision and one audit entry. Checks are informational and are captured
 * in the audit record alongside the decision.
 */
export async function reviewPost(operator: OperatorContext, decision: ReviewDecision): Promise<ReviewOutcome> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await selectReviewRows(tx).where(eq(posts.id, decision.postId)).limit(1);
    if (!row) throw new NotFoundError("Post not found.");
    if (row.reviewStatus !== "submitted") {
      throw new ConflictError(`This post was already ${row.reviewStatus}. Reload the queue to see its current state.`);
    }
    const item = toItem(row);
    const status = decision.decision === "approve" ? "approved" : "rejected";
    const reviewReason = decision.decision === "reject" ? formatStoredReason(decision.reasonCode, decision.note) : null;
    const updated = await tx
      .update(posts)
      .set({ reviewStatus: status, reviewReason, reviewedAt: new Date(), reviewedByUserId: operator.user.id })
      .where(and(eq(posts.id, row.postId), eq(posts.orgId, row.orgId), eq(posts.reviewStatus, "submitted")))
      .returning({ id: posts.id });
    if (!updated.length) throw new ConflictError("This post was reviewed by someone else. Reload the queue to see its current state.");

    await recordAudit(
      {
        orgId: row.orgId,
        actorUserId: operator.user.id,
        action: status === "approved" ? "ops.post.approve" : "ops.post.reject",
        targetType: "post",
        targetId: row.postId,
        data: {
          via: "operator_console",
          previousStatus: "submitted",
          ...(decision.decision === "reject" ? { reasonCode: decision.reasonCode, note: decision.note } : {}),
          checks: Object.fromEntries(item.checks.map((c) => [c.key, c.status])),
        },
      },
      tx,
    );
    return { postId: row.postId, status };
  });
}
