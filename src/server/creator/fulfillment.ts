import "server-only";
import { and, count, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/ids";
import { platformLabels, type Platform } from "@/domain/campaign";
import { creatorVariation, type CreatorVariation } from "@/domain/creator-variation";
import type { ContentFormat } from "@/domain/playbook-content";
import { fail, fromZodError, ok, type ActionResult } from "../action-result";
import { recordAudit } from "../audit";
import { NotFoundError } from "../authz";
import { getDb, type DbLike } from "../db/client";
import {
  adRightsGrants,
  campaignMemberships,
  campaigns,
  ledgerEntries,
  orgCreators,
  organizations,
  playbookRevisions,
  playbooks,
  posts,
  socialAccounts,
  type ReviewStatus,
} from "../db/schema";
import { capability, type CapabilityState } from "../readiness";
import { requireCreatorAction, runCreatorAction, type CreatorContext } from "./context";
import { normalizePostUrl } from "./submission-url";

/**
 * Creator fulfillment: the published playbook an admitted creator works from,
 * post submission, submission history and the earnings / payout panels.
 * Every query is qualified by the session creator's ID.
 */

/* ----------------------------------------------------------------------------
 * Admission gate
 * ------------------------------------------------------------------------- */

interface AdmittedCampaign {
  id: string;
  orgId: string;
  name: string;
  status: "inactive" | "active" | "paused";
  primaryHashtag: string;
  targetPlatforms: Platform[];
  brandName: string;
}

/** The campaign if this creator holds an APPROVED admission and the brand has not removed them; otherwise null. */
async function admittedCampaign(db: DbLike, creatorId: string, campaignId: string): Promise<AdmittedCampaign | null> {
  const [row] = await db
    .select({
      id: campaigns.id,
      orgId: campaigns.orgId,
      name: campaigns.name,
      status: campaigns.status,
      primaryHashtag: campaigns.primaryHashtag,
      targeting: campaigns.targeting,
      brandName: organizations.name,
      removedAt: orgCreators.removedAt,
    })
    .from(campaignMemberships)
    .innerJoin(campaigns, and(eq(campaigns.id, campaignMemberships.campaignId), eq(campaigns.orgId, campaignMemberships.orgId)))
    .innerJoin(organizations, eq(organizations.id, campaigns.orgId))
    .leftJoin(orgCreators, and(eq(orgCreators.orgId, campaigns.orgId), eq(orgCreators.creatorId, campaignMemberships.creatorId)))
    .where(and(eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.creatorId, creatorId), eq(campaignMemberships.status, "approved")))
    .limit(1);
  if (!row || row.removedAt) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    status: row.status,
    primaryHashtag: row.primaryHashtag,
    brandName: row.brandName,
    targetPlatforms: row.targeting.platforms,
  };
}

async function distributedPlaybook(db: DbLike, campaign: AdmittedCampaign, playbookId: string) {
  const [row] = await db
    .select({ id: playbooks.id, name: playbooks.name, format: playbooks.format, revision: playbooks.publishedRevision })
    .from(playbooks)
    .where(
      and(
        eq(playbooks.id, playbookId),
        eq(playbooks.campaignId, campaign.id),
        eq(playbooks.orgId, campaign.orgId),
        eq(playbooks.status, "published"),
        eq(playbooks.active, true),
        isNotNull(playbooks.publishedRevision),
      ),
    )
    .limit(1);
  return row && row.revision !== null ? { ...row, revision: row.revision } : null;
}

/* ----------------------------------------------------------------------------
 * Playbook view
 * ------------------------------------------------------------------------- */

export interface SubmissionAccount {
  id: string;
  platform: Platform;
  handle: string;
  verification: "unverified" | "pending" | "verified" | "failed";
}

export interface CreatorPlaybookView {
  campaign: { id: string; name: string; brandName: string; primaryHashtag: string; targetPlatforms: Platform[] };
  playbook: { id: string; name: string; format: ContentFormat; revision: number; publishedAt: string };
  variation: CreatorVariation;
  /** The creator's accounts on the campaign's platforms (submission choices). */
  accounts: SubmissionAccount[];
}

/** The PUBLISHED revision of a playbook for an admitted creator of an active campaign; null otherwise. Drafts are never read. */
export async function loadCreatorPlaybook(ctx: Pick<CreatorContext, "creator">, campaignId: string, playbookId: string): Promise<CreatorPlaybookView | null> {
  const db = await getDb();
  const campaign = await admittedCampaign(db, ctx.creator.id, campaignId);
  if (!campaign || campaign.status !== "active") return null;
  const playbook = await distributedPlaybook(db, campaign, playbookId);
  if (!playbook) return null;
  const [revision] = await db
    .select()
    .from(playbookRevisions)
    .where(and(eq(playbookRevisions.playbookId, playbook.id), eq(playbookRevisions.orgId, campaign.orgId), eq(playbookRevisions.revision, playbook.revision)))
    .limit(1);
  if (!revision) return null;
  const accountRows = await db
    .select({ id: socialAccounts.id, platform: socialAccounts.platform, handle: socialAccounts.handle, verification: socialAccounts.verification })
    .from(socialAccounts)
    .where(eq(socialAccounts.creatorId, ctx.creator.id))
    .orderBy(socialAccounts.platform, socialAccounts.handle);
  const allowed = (p: Platform) => campaign.targetPlatforms.length === 0 || campaign.targetPlatforms.includes(p);
  return {
    campaign: { id: campaign.id, name: campaign.name, brandName: campaign.brandName, primaryHashtag: campaign.primaryHashtag, targetPlatforms: campaign.targetPlatforms },
    playbook: { id: playbook.id, name: revision.name, format: playbook.format, revision: revision.revision, publishedAt: revision.publishedAt.toISOString() },
    variation: creatorVariation({ creatorId: ctx.creator.id, playbookId: playbook.id, revision: revision.revision }, revision, campaign.primaryHashtag),
    accounts: accountRows.filter((a) => allowed(a.platform)),
  };
}

/* ----------------------------------------------------------------------------
 * Submission
 * ------------------------------------------------------------------------- */

/** Paid-ad providers a creator can authorize per platform (ADS-03: native placements only). */
export function adProvidersFor(platform: Platform): Array<"meta_ads" | "tiktok_ads"> {
  if (platform === "tiktok") return ["tiktok_ads"];
  if (platform === "instagram" || platform === "facebook_reels") return ["meta_ads"];
  return [];
}

/** Rights granted from the portal last this long unless revoked (CREATOR-PORTAL-09). */
export const AD_RIGHTS_TERM_DAYS = 180;
/** Version of the consent wording shown next to the checkbox; stored with the grant's evidence reference. */
export const AD_RIGHTS_TERMS_VERSION = "creator-portal-ad-rights-v1";

export function adRightsTermsText(brandName: string): string {
  return `I allow ${brandName} to run this post as a paid ad on the ad platforms listed, for ${AD_RIGHTS_TERM_DAYS} days from today. I confirm I own this post and can grant this. I can ask for this permission to be withdrawn at any time; it then stops new ads using the post.`;
}

export const CAPTION_MAX_LENGTH = 2200;

export const submissionSchema = z.object({
  campaignId: z.string().trim().min(1).max(100),
  playbookId: z.string().trim().min(1).max(100),
  socialAccountId: z.string().trim().min(1, "Choose the account you posted from.").max(100),
  url: z.string().max(2000),
  caption: z.string().trim().min(1, "Paste the caption you posted with.").max(CAPTION_MAX_LENGTH, `Captions are at most ${CAPTION_MAX_LENGTH} characters.`),
  grantAdRights: z.boolean().default(false),
});
export type SubmissionInput = z.input<typeof submissionSchema>;

function captionHasHashtag(caption: string, tag: string): boolean {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_])#${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(caption);
}

export async function submitPost(input: SubmissionInput): Promise<ActionResult<{ postId: string; adRightsGranted: boolean }>> {
  return runCreatorAction(async () => {
    const ctx = await requireCreatorAction();
    const parsed = submissionSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const data = parsed.data;
    const db = await getDb();

    const campaign = await admittedCampaign(db, ctx.creator.id, data.campaignId);
    if (!campaign) return fail("You need to be admitted to this campaign before submitting posts.", "forbidden");
    if (campaign.status !== "active") return fail("This campaign isn't active right now, so it isn't accepting posts.", "conflict");
    const playbook = await distributedPlaybook(db, campaign, data.playbookId);
    if (!playbook) throw new NotFoundError("Playbook not found.");

    const [account] = await db
      .select({ id: socialAccounts.id, platform: socialAccounts.platform, handle: socialAccounts.handle })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.id, data.socialAccountId), eq(socialAccounts.creatorId, ctx.creator.id)))
      .limit(1);
    if (!account) return fail("Check the highlighted fields.", "validation", { socialAccountId: "Choose one of your linked accounts." });
    if (campaign.targetPlatforms.length > 0 && !campaign.targetPlatforms.includes(account.platform)) {
      return fail("Check the highlighted fields.", "validation", { socialAccountId: `This campaign doesn't run on ${platformLabels[account.platform]}.` });
    }

    const url = normalizePostUrl(account.platform, data.url);
    if (!url.ok) return fail("Check the highlighted fields.", "validation", { url: url.error });
    if (!captionHasHashtag(data.caption, campaign.primaryHashtag)) {
      return fail("Check the highlighted fields.", "validation", { caption: `Include #${campaign.primaryHashtag} in your caption — the brand matches posts by it.` });
    }
    const providers = adProvidersFor(account.platform);
    if (data.grantAdRights && providers.length === 0) {
      return fail("Check the highlighted fields.", "validation", { grantAdRights: `Paid-ad rights aren't available for ${platformLabels[account.platform]} posts.` });
    }

    const duplicate = () => fail("Check the highlighted fields.", "conflict", { url: "This post has already been submitted." });
    const [existing] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.platform, account.platform), eq(posts.url, url.url))).limit(1);
    if (existing) return duplicate();

    const postId = newId("pst");
    const now = new Date();
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(posts)
        .values({
          id: postId,
          orgId: campaign.orgId,
          campaignId: campaign.id,
          playbookId: playbook.id,
          playbookRevision: playbook.revision,
          creatorId: ctx.creator.id,
          socialAccountId: account.id,
          platform: account.platform,
          handle: account.handle,
          url: url.url,
          caption: data.caption,
          submittedAt: now,
          reviewStatus: "submitted",
        })
        .onConflictDoNothing({ target: [posts.platform, posts.url] })
        .returning({ id: posts.id });
      if (!row) return false;
      if (data.grantAdRights) {
        await tx.insert(adRightsGrants).values({
          id: newId("rgt"),
          orgId: campaign.orgId,
          creatorId: ctx.creator.id,
          postId,
          providers,
          evidenceKind: "creator_portal_consent",
          evidenceReference: `${AD_RIGHTS_TERMS_VERSION}:${postId}`,
          grantedAt: now,
          expiresAt: new Date(now.getTime() + AD_RIGHTS_TERM_DAYS * 86_400_000),
          recordedByUserId: ctx.user.id,
        });
      }
      await recordAudit(
        {
          orgId: campaign.orgId,
          actorUserId: ctx.user.id,
          action: "post.submit",
          targetType: "post",
          targetId: postId,
          data: { campaignId: campaign.id, playbookId: playbook.id, revision: playbook.revision, adRightsGranted: data.grantAdRights },
        },
        tx,
      );
      return true;
    });
    if (!created) return duplicate();
    return ok({ postId, adRightsGranted: data.grantAdRights }, "Post submitted for review.");
  });
}

/* ----------------------------------------------------------------------------
 * Submission history
 * ------------------------------------------------------------------------- */

export const SUBMISSIONS_PAGE_SIZE = 25;

export interface SubmissionRow {
  id: string;
  platform: Platform;
  handle: string;
  url: string;
  campaignName: string | null;
  brandName: string;
  playbookName: string | null;
  playbookRevision: number | null;
  submittedAt: string;
  reviewStatus: ReviewStatus;
  reviewReason: string | null;
  reviewedAt: string | null;
  adRights: { expiresAt: string | null; revoked: boolean } | null;
}

export async function listSubmissions(ctx: Pick<CreatorContext, "creator">, page = 1): Promise<{ rows: SubmissionRow[]; total: number; page: number; pageSize: number }> {
  const db = await getDb();
  const where = eq(posts.creatorId, ctx.creator.id);
  const [{ total }] = await db.select({ total: count() }).from(posts).where(where);
  const pages = Math.max(1, Math.ceil(Number(total) / SUBMISSIONS_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const rows = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      handle: posts.handle,
      url: posts.url,
      campaignName: campaigns.name,
      brandName: organizations.name,
      playbookName: playbooks.name,
      playbookRevision: posts.playbookRevision,
      submittedAt: posts.submittedAt,
      reviewStatus: posts.reviewStatus,
      reviewReason: posts.reviewReason,
      reviewedAt: posts.reviewedAt,
    })
    .from(posts)
    .innerJoin(organizations, eq(organizations.id, posts.orgId))
    .leftJoin(campaigns, and(eq(campaigns.id, posts.campaignId), eq(campaigns.orgId, posts.orgId)))
    .leftJoin(playbooks, and(eq(playbooks.id, posts.playbookId), eq(playbooks.orgId, posts.orgId)))
    .where(where)
    .orderBy(desc(posts.submittedAt), desc(posts.id))
    .limit(SUBMISSIONS_PAGE_SIZE)
    .offset((current - 1) * SUBMISSIONS_PAGE_SIZE);
  const ids = rows.map((r) => r.id);
  const grants = ids.length
    ? await db
        .select({ postId: adRightsGrants.postId, expiresAt: adRightsGrants.expiresAt, revokedAt: adRightsGrants.revokedAt })
        .from(adRightsGrants)
        .where(and(inArray(adRightsGrants.postId, ids), eq(adRightsGrants.creatorId, ctx.creator.id)))
        .orderBy(desc(adRightsGrants.grantedAt))
    : [];
  return {
    total: Number(total),
    page: current,
    pageSize: SUBMISSIONS_PAGE_SIZE,
    rows: rows.map((r) => {
      const grant = grants.find((g) => g.postId === r.id);
      return {
        ...r,
        submittedAt: r.submittedAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        adRights: grant ? { expiresAt: grant.expiresAt?.toISOString() ?? null, revoked: grant.revokedAt !== null } : null,
      };
    }),
  };
}

export interface SubmissionCounts {
  submitted: number;
  approved: number;
  rejected: number;
}

export async function submissionCounts(ctx: Pick<CreatorContext, "creator">): Promise<SubmissionCounts> {
  const db = await getDb();
  const rows = await db.select({ status: posts.reviewStatus, n: count() }).from(posts).where(eq(posts.creatorId, ctx.creator.id)).groupBy(posts.reviewStatus);
  const get = (s: ReviewStatus) => Number(rows.find((r) => r.status === s)?.n ?? 0);
  return { submitted: get("submitted"), approved: get("approved"), rejected: get("rejected") };
}

/* ----------------------------------------------------------------------------
 * Earnings and payouts
 * ------------------------------------------------------------------------- */

export interface EarningsSummary {
  /** Sum of creator_obligation entries for this creator, in cents (0 with no entries is a confirmed zero). */
  balanceCents: number;
  entryCount: number;
  recent: Array<{ id: string; amountCents: number; description: string; occurredAt: string; brandName: string }>;
}

/**
 * Creator obligations are ledger entries in the `creator_obligation` account
 * that reference the creator (`ref_type = 'creator'`) or one of the
 * creator's posts (`ref_type = 'post'`). No earning job exists yet, so this
 * is normally empty (CREATOR-PORTAL-10).
 */
export async function loadEarnings(ctx: Pick<CreatorContext, "creator">): Promise<EarningsSummary> {
  const db = await getDb();
  const mine = and(
    eq(ledgerEntries.account, "creator_obligation"),
    or(
      and(eq(ledgerEntries.refType, "creator"), eq(ledgerEntries.refId, ctx.creator.id)),
      and(eq(ledgerEntries.refType, "post"), sql`${ledgerEntries.refId} in (select id from posts where creator_id = ${ctx.creator.id})`),
    ),
  );
  const [totals] = await db.select({ sum: sql<number | string | null>`sum(${ledgerEntries.amountCents})`, n: count() }).from(ledgerEntries).where(mine);
  const recent = await db
    .select({ id: ledgerEntries.id, amountCents: ledgerEntries.amountCents, description: ledgerEntries.description, occurredAt: ledgerEntries.occurredAt, brandName: organizations.name })
    .from(ledgerEntries)
    .innerJoin(organizations, eq(organizations.id, ledgerEntries.orgId))
    .where(mine)
    .orderBy(desc(ledgerEntries.occurredAt), desc(ledgerEntries.id))
    .limit(10);
  return {
    balanceCents: Number(totals?.sum ?? 0),
    entryCount: Number(totals?.n ?? 0),
    recent: recent.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() })),
  };
}

export function payoutReadiness(): CapabilityState {
  return capability("creator_payouts");
}
