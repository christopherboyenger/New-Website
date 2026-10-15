import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  creatorLevels,
  minCreatorLevelLabels,
  platformLabels,
  type CampaignApprovals,
  type CampaignTargeting,
  type CreatorLevel,
  type Platform,
} from "@/domain/campaign";
import type { ContentFormat } from "@/domain/playbook-content";
import { fail, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { NotFoundError, requireOrgAction, type OrgContext } from "./authz";
import { clampPage, type Paged } from "./members";
import { getDb, type DbLike } from "./db/client";
import { campaignMemberships, campaigns, creators, orgCreators, organizations, playbookRevisions, playbooks, socialAccounts } from "./db/schema";
import { isCreatorRemovedFromOrg } from "./creators-roster";
import { requireCreatorAction, runCreatorAction, type CreatorContext } from "./creator/context";

/**
 * Campaign admission (production-requirements.md §2: identity → campaign
 * admission → playbook publication → submission → review → earnings).
 *
 * A campaign is offered to a creator only when it is ACTIVE, has at least one
 * published + active playbook, the creator meets its targeting and approval
 * requirements, and the brand has not removed the creator. Joining creates a
 * campaign_memberships row: `approved` immediately, or `requested` when the
 * campaign requires creator approval; the brand decides requests from
 * /home/<org>/creators/requests. Admission is separate from post review.
 */

/* ----------------------------------------------------------------------------
 * Eligibility (pure)
 * ------------------------------------------------------------------------- */

export interface EligibilityCampaign {
  targeting: CampaignTargeting;
  approvals: CampaignApprovals;
}

export interface EligibilityCreator {
  level: CreatorLevel;
  country: string | null;
}

export interface EligibilityAccount {
  platform: Platform;
  verification: "unverified" | "pending" | "verified" | "failed";
  dedicated: boolean;
}

export type Ineligibility = "country" | "platform" | "level" | "dedicated" | "demographics";

export interface Eligibility {
  eligible: boolean;
  reasons: Ineligibility[];
  /** Platforms the creator can post this campaign from (targeted and linked). */
  platforms: Platform[];
}

export const ineligibilityMessages: Record<Ineligibility, string> = {
  country: "This campaign is for creators in other countries.",
  platform: "Link an account on one of this campaign's platforms to take part.",
  level: "This campaign needs a higher creator level.",
  dedicated: "This campaign needs a dedicated account whose ownership is verified.",
  demographics: "This campaign targets audience demographics that creator profiles don't record yet.",
};

function levelRank(level: CreatorLevel): number {
  return creatorLevels.indexOf(level);
}

export function hasDemographicTargeting(t: CampaignTargeting): boolean {
  return t.ageMin !== null || t.ageMax !== null || t.gender !== "any" || t.metros.length > 0;
}

/**
 * Rules (docs/decisions/creator-portal.md CREATOR-PORTAL-02…05):
 * - countries: empty = all; otherwise the creator's country must be listed.
 * - platforms: the creator needs a linked account on a targeted platform
 *   (any platform when none are targeted).
 * - minimum level: creator level at or above the minimum.
 * - dedicated account: a linked account flagged dedicated AND verified on a
 *   targeted platform (a user-entered handle is not proof of ownership).
 * - demographic targeting (age/gender/metro) cannot be evaluated → not eligible.
 */
export function evaluateEligibility(campaign: EligibilityCampaign, creator: EligibilityCreator, accounts: readonly EligibilityAccount[]): Eligibility {
  const reasons: Ineligibility[] = [];
  const t = campaign.targeting;
  if (t.countries.length > 0 && (!creator.country || !t.countries.includes(creator.country))) reasons.push("country");
  const allowed = (p: Platform) => t.platforms.length === 0 || t.platforms.includes(p);
  const usable = accounts.filter((a) => allowed(a.platform));
  if (usable.length === 0) reasons.push("platform");
  if (t.minCreatorLevel !== "all" && levelRank(creator.level) < levelRank(t.minCreatorLevel)) reasons.push("level");
  if (campaign.approvals.requireDedicatedAccount && !usable.some((a) => a.dedicated && a.verification === "verified")) reasons.push("dedicated");
  if (hasDemographicTargeting(t)) reasons.push("demographics");
  const platforms = [...new Set(usable.map((a) => a.platform))];
  return { eligible: reasons.length === 0, reasons, platforms };
}

/** Human-readable requirement lines shown on a campaign card (no rates or reach promises). */
export function requirementLines(campaign: EligibilityCampaign): string[] {
  const t = campaign.targeting;
  const lines: string[] = [];
  lines.push(t.platforms.length ? `Post on ${t.platforms.map((p) => platformLabels[p]).join(", ")}` : "Post on any supported platform");
  if (t.countries.length) lines.push(`Creators in ${t.countries.length === 1 ? "1 country" : `${t.countries.length} countries`}`);
  if (t.minCreatorLevel !== "all") lines.push(`Creator level ${minCreatorLevelLabels[t.minCreatorLevel]}`);
  if (campaign.approvals.requireDedicatedAccount) lines.push("Dedicated, verified account");
  lines.push(campaign.approvals.requireCreatorApproval ? "Brand approves each creator who asks to join" : "Join instantly");
  return lines;
}

/* ----------------------------------------------------------------------------
 * Discovery (creator side)
 * ------------------------------------------------------------------------- */

export type AdmissionStatus = "requested" | "approved" | "rejected" | "removed";

export interface DiscoveredCampaign {
  id: string;
  name: string;
  brandName: string;
  brandHashtag: string | null;
  brandDescription: string;
  primaryHashtag: string;
  format: ContentFormat;
  targeting: CampaignTargeting;
  approvals: CampaignApprovals;
  requirements: string[];
  playbookCount: number;
  admission: AdmissionStatus | null;
  eligibility: Eligibility;
  /** Approved creators have reached the campaign's maximum. */
  full: boolean;
}

export const DISCOVERY_LIMIT = 200;

/** SQL predicate: the campaign has at least one published + active playbook. */
const hasDistributedPlaybook = sql`exists (select 1 from playbooks p where p.campaign_id = ${campaigns.id} and p.org_id = ${campaigns.orgId} and p.status = 'published' and p.active and p.published_revision is not null)`;

async function creatorAccounts(db: DbLike, creatorId: string): Promise<EligibilityAccount[]> {
  return db
    .select({ platform: socialAccounts.platform, verification: socialAccounts.verification, dedicated: socialAccounts.dedicated })
    .from(socialAccounts)
    .where(eq(socialAccounts.creatorId, creatorId));
}

const campaignColumns = {
  id: campaigns.id,
  orgId: campaigns.orgId,
  name: campaigns.name,
  status: campaigns.status,
  primaryHashtag: campaigns.primaryHashtag,
  format: campaigns.format,
  targeting: campaigns.targeting,
  approvals: campaigns.approvals,
  maxCreators: campaigns.maxCreators,
  brandName: organizations.name,
  brandHashtag: organizations.brandHashtag,
  brandDescription: organizations.shortDescription,
  admission: campaignMemberships.status,
  playbookCount: sql<number>`(select count(*) from playbooks p where p.campaign_id = ${campaigns.id} and p.org_id = ${campaigns.orgId} and p.status = 'published' and p.active)`,
  approvedCount: sql<number>`(select count(*) from campaign_memberships m where m.campaign_id = ${campaigns.id} and m.status = 'approved')`,
};

/** SQL predicate: the brand removed this creator from its roster. */
const removedFromOrg = (creatorId: string) =>
  sql<boolean>`exists (select 1 from org_creators oc where oc.org_id = ${campaigns.orgId} and oc.creator_id = ${creatorId} and oc.removed_at is not null)`;

type CampaignRow = {
  id: string;
  orgId: string;
  name: string;
  status: "inactive" | "active" | "paused";
  primaryHashtag: string;
  format: ContentFormat;
  targeting: CampaignTargeting;
  approvals: CampaignApprovals;
  maxCreators: number | null;
  brandName: string;
  brandHashtag: string | null;
  brandDescription: string;
  admission: AdmissionStatus | null;
  playbookCount: number;
  approvedCount: number;
};

function toDiscovered(row: CampaignRow, creator: EligibilityCreator, accounts: EligibilityAccount[]): DiscoveredCampaign {
  const approvedCount = Number(row.approvedCount);
  return {
    id: row.id,
    name: row.name,
    brandName: row.brandName,
    brandHashtag: row.brandHashtag,
    brandDescription: row.brandDescription,
    primaryHashtag: row.primaryHashtag,
    format: row.format,
    targeting: row.targeting,
    approvals: row.approvals,
    requirements: requirementLines(row),
    playbookCount: Number(row.playbookCount),
    admission: row.admission,
    eligibility: evaluateEligibility(row, creator, accounts),
    full: row.maxCreators !== null && approvedCount >= row.maxCreators,
  };
}

export interface Discovery {
  /** Campaigns the creator has joined or asked to join (active, with a distributed playbook). */
  mine: DiscoveredCampaign[];
  /** Eligible campaigns the creator has not joined yet. */
  available: DiscoveredCampaign[];
  hasAccounts: boolean;
}

export async function discoverCampaigns(ctx: Pick<CreatorContext, "creator">): Promise<Discovery> {
  const db = await getDb();
  const creatorId = ctx.creator.id;
  const accounts = await creatorAccounts(db, creatorId);
  const rows = (await db
    .select({ ...campaignColumns, removedFromOrg: removedFromOrg(creatorId) })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.orgId))
    .leftJoin(campaignMemberships, and(eq(campaignMemberships.campaignId, campaigns.id), eq(campaignMemberships.creatorId, creatorId)))
    .where(and(eq(campaigns.status, "active"), hasDistributedPlaybook))
    .orderBy(desc(sql`coalesce(${campaigns.activatedAt}, ${campaigns.createdAt})`), asc(campaigns.id))
    .limit(DISCOVERY_LIMIT)) as Array<CampaignRow & { removedFromOrg: boolean }>;

  const mine: DiscoveredCampaign[] = [];
  const available: DiscoveredCampaign[] = [];
  for (const row of rows) {
    if (row.removedFromOrg) continue;
    const item = toDiscovered(row, ctx.creator, accounts);
    if (row.admission === "approved" || row.admission === "requested") mine.push(item);
    else if (row.admission === null && item.eligibility.eligible) available.push(item);
  }
  return { mine, available, hasAccounts: accounts.length > 0 };
}

export interface CreatorCampaignView extends DiscoveredCampaign {
  status: "inactive" | "active" | "paused";
  playbooks: Array<{ id: string; name: string; format: ContentFormat; revision: number }>;
}

/**
 * One campaign as the creator may see it: either they have an admission row
 * (any status), or it is currently offered to them. Anything else — another
 * campaign, an inactive/undistributed one, or a brand that removed them — is
 * reported as not found.
 */
export async function loadCreatorCampaign(ctx: Pick<CreatorContext, "creator">, campaignId: string): Promise<CreatorCampaignView | null> {
  const db = await getDb();
  const creatorId = ctx.creator.id;
  const [row] = (await db
    .select({ ...campaignColumns, removedFromOrg: removedFromOrg(creatorId) })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.orgId))
    .leftJoin(campaignMemberships, and(eq(campaignMemberships.campaignId, campaigns.id), eq(campaignMemberships.creatorId, creatorId)))
    .where(eq(campaigns.id, campaignId))
    .limit(1)) as Array<CampaignRow & { removedFromOrg: boolean }>;
  if (!row || row.removedFromOrg) return null;
  const accounts = await creatorAccounts(db, creatorId);
  const view = toDiscovered(row, ctx.creator, accounts);
  const offered = row.status === "active" && view.playbookCount > 0 && view.eligibility.eligible;
  if (!row.admission && !offered) return null;

  const distributed =
    row.admission === "approved" && row.status === "active"
      ? await db
          // Names come from the published revision: a renamed draft is not shown to creators.
          .select({ id: playbooks.id, name: playbookRevisions.name, format: playbooks.format, revision: playbookRevisions.revision })
          .from(playbooks)
          .innerJoin(playbookRevisions, and(eq(playbookRevisions.playbookId, playbooks.id), eq(playbookRevisions.orgId, playbooks.orgId), eq(playbookRevisions.revision, playbooks.publishedRevision)))
          .where(and(eq(playbooks.campaignId, row.id), eq(playbooks.orgId, row.orgId), eq(playbooks.status, "published"), eq(playbooks.active, true), isNotNull(playbooks.publishedRevision)))
          .orderBy(asc(playbookRevisions.name), asc(playbooks.id))
      : [];
  return { ...view, status: row.status, playbooks: distributed };
}

/* ----------------------------------------------------------------------------
 * Join (creator side)
 * ------------------------------------------------------------------------- */

const campaignIdSchema = z.object({ campaignId: z.string().trim().min(1).max(100) });

export async function joinCampaign(input: { campaignId: string }): Promise<ActionResult<{ status: "requested" | "approved" }>> {
  return runCreatorAction(async () => {
    const ctx = await requireCreatorAction();
    const parsed = campaignIdSchema.safeParse(input);
    if (!parsed.success) return fail("Choose a campaign to join.");
    const view = await loadCreatorCampaign(ctx, parsed.data.campaignId);
    if (!view) throw new NotFoundError("Campaign not found.");
    if (view.admission === "approved" || view.admission === "requested") return ok({ status: view.admission });
    if (view.admission) return fail("You can't join this campaign.", "conflict");
    if (view.status !== "active" || view.playbookCount === 0) throw new NotFoundError("Campaign not found.");
    if (!view.eligibility.eligible) return fail(ineligibilityMessages[view.eligibility.reasons[0]], "validation");

    const db = await getDb();
    const [campaign] = await db.select({ id: campaigns.id, orgId: campaigns.orgId }).from(campaigns).where(eq(campaigns.id, view.id)).limit(1);
    if (!campaign) throw new NotFoundError("Campaign not found.");
    if (await isCreatorRemovedFromOrg(campaign.orgId, ctx.creator.id)) throw new NotFoundError("Campaign not found.");

    const status: "requested" | "approved" = view.approvals.requireCreatorApproval ? "requested" : "approved";
    const outcome = await db.transaction(async (tx) => {
      // Serialize joins per campaign so the creator cap cannot be exceeded.
      const [locked] = await tx.select({ maxCreators: campaigns.maxCreators }).from(campaigns).where(eq(campaigns.id, campaign.id)).for("update");
      if (status === "approved" && locked.maxCreators !== null) {
        const [{ n }] = await tx
          .select({ n: count() })
          .from(campaignMemberships)
          .where(and(eq(campaignMemberships.campaignId, campaign.id), eq(campaignMemberships.status, "approved")));
        if (Number(n) >= locked.maxCreators) return "full" as const;
      }
      const now = new Date();
      const [inserted] = await tx
        .insert(campaignMemberships)
        .values({ campaignId: campaign.id, creatorId: ctx.creator.id, orgId: campaign.orgId, status, requestedAt: now, decidedAt: status === "approved" ? now : null })
        .onConflictDoNothing()
        .returning({ status: campaignMemberships.status });
      if (!inserted) return "exists" as const;
      await tx.insert(orgCreators).values({ orgId: campaign.orgId, creatorId: ctx.creator.id }).onConflictDoNothing();
      await recordAudit(
        { orgId: campaign.orgId, actorUserId: ctx.user.id, action: status === "approved" ? "campaign_membership.join" : "campaign_membership.request", targetType: "campaign", targetId: campaign.id, data: { creatorId: ctx.creator.id } },
        tx,
      );
      return "created" as const;
    });
    if (outcome === "full") return fail("This campaign has reached its creator limit.", "conflict");
    if (outcome === "exists") {
      const [current] = await db
        .select({ status: campaignMemberships.status })
        .from(campaignMemberships)
        .where(and(eq(campaignMemberships.campaignId, campaign.id), eq(campaignMemberships.creatorId, ctx.creator.id)))
        .limit(1);
      if (current?.status === "approved" || current?.status === "requested") return ok({ status: current.status });
      return fail("You can't join this campaign.", "conflict");
    }
    return ok({ status }, status === "approved" ? "You joined the campaign." : "Request sent. The brand will review it.");
  });
}

/* ----------------------------------------------------------------------------
 * Join requests (brand side)
 * ------------------------------------------------------------------------- */

export const REQUESTS_PAGE_SIZE = 25;

export interface JoinRequestRow {
  campaignId: string;
  campaignName: string;
  creatorId: string;
  creatorName: string;
  level: CreatorLevel;
  country: string | null;
  requestedAt: string;
  removed: boolean;
  accounts: Array<{ platform: Platform; handle: string; verification: "unverified" | "pending" | "verified" | "failed"; dedicated: boolean }>;
}

/** Pending admission requests for the authorized org (oldest first). Caller checks `creator:manage`. */
export async function listJoinRequests(ctx: OrgContext, page = 1): Promise<Paged<JoinRequestRow>> {
  const db = await getDb();
  const orgId = ctx.org.id;
  const where = and(eq(campaignMemberships.orgId, orgId), eq(campaignMemberships.status, "requested"), eq(campaigns.orgId, orgId));
  const [{ total }] = await db
    .select({ total: count() })
    .from(campaignMemberships)
    .innerJoin(campaigns, eq(campaigns.id, campaignMemberships.campaignId))
    .where(where);
  const current = clampPage(page, Number(total), REQUESTS_PAGE_SIZE);
  const rows = await db
    .select({
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      creatorId: creators.id,
      creatorName: creators.displayName,
      level: creators.level,
      country: creators.country,
      requestedAt: campaignMemberships.requestedAt,
      removed: sql<boolean>`exists (select 1 from org_creators oc where oc.org_id = ${orgId} and oc.creator_id = ${creators.id} and oc.removed_at is not null)`,
    })
    .from(campaignMemberships)
    .innerJoin(campaigns, eq(campaigns.id, campaignMemberships.campaignId))
    .innerJoin(creators, eq(creators.id, campaignMemberships.creatorId))
    .where(where)
    .orderBy(asc(campaignMemberships.requestedAt), asc(creators.id))
    .limit(REQUESTS_PAGE_SIZE)
    .offset((current - 1) * REQUESTS_PAGE_SIZE);
  const ids = [...new Set(rows.map((r) => r.creatorId))];
  const accounts = ids.length
    ? await db
        .select({ creatorId: socialAccounts.creatorId, platform: socialAccounts.platform, handle: socialAccounts.handle, verification: socialAccounts.verification, dedicated: socialAccounts.dedicated })
        .from(socialAccounts)
        .where(inArray(socialAccounts.creatorId, ids))
        .orderBy(asc(socialAccounts.platform), asc(socialAccounts.handle))
    : [];
  return {
    total: Number(total),
    page: current,
    pageSize: REQUESTS_PAGE_SIZE,
    rows: rows.map((r) => ({
      ...r,
      removed: Boolean(r.removed),
      requestedAt: r.requestedAt.toISOString(),
      accounts: accounts.filter((a) => a.creatorId === r.creatorId).map(({ creatorId: _creatorId, ...a }) => a),
    })),
  };
}

const decisionSchema = z.object({ campaignId: z.string().trim().min(1).max(100), creatorId: z.string().trim().min(1).max(100) });

/**
 * Approve or reject one pending request. Requires `creator:manage`; the
 * request must belong to the authorized org. Approving a creator the org
 * removed is refused (restore them first), and approval respects the
 * campaign's creator cap. Audited either way.
 */
export async function decideJoinRequest(slug: string, input: { campaignId: string; creatorId: string }, decision: "approve" | "reject"): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "creator:manage");
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail("Choose a request.");
    const { campaignId, creatorId } = parsed.data;
    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      const [campaign] = await tx
        .select({ id: campaigns.id, maxCreators: campaigns.maxCreators })
        .from(campaigns)
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, ctx.org.id)))
        .for("update");
      if (!campaign) throw new NotFoundError("Request not found.");
      const [request] = await tx
        .select({ status: campaignMemberships.status })
        .from(campaignMemberships)
        .where(and(eq(campaignMemberships.orgId, ctx.org.id), eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.creatorId, creatorId)))
        .limit(1);
      if (!request) throw new NotFoundError("Request not found.");
      if (request.status !== "requested") return fail("This request was already decided. Reload to see its current state.", "conflict");
      if (decision === "approve") {
        const [removed] = await tx
          .select({ at: orgCreators.removedAt })
          .from(orgCreators)
          .where(and(eq(orgCreators.orgId, ctx.org.id), eq(orgCreators.creatorId, creatorId), isNotNull(orgCreators.removedAt)))
          .limit(1);
        if (removed) return fail("This creator was removed from your workspace. Restore them on the Creators page before approving.", "conflict");
        if (campaign.maxCreators !== null) {
          const [{ n }] = await tx
            .select({ n: count() })
            .from(campaignMemberships)
            .where(and(eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.status, "approved")));
          if (Number(n) >= campaign.maxCreators) return fail("This campaign has reached its creator limit. Raise the limit or reject the request.", "conflict");
        }
      }
      const status = decision === "approve" ? "approved" : "rejected";
      await tx
        .update(campaignMemberships)
        .set({ status, decidedAt: new Date(), decidedByUserId: ctx.user.id })
        .where(and(eq(campaignMemberships.orgId, ctx.org.id), eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.creatorId, creatorId), eq(campaignMemberships.status, "requested")));
      await recordAudit(
        { orgId: ctx.org.id, actorUserId: ctx.user.id, action: `campaign_membership.${decision}`, targetType: "campaign", targetId: campaignId, data: { creatorId } },
        tx,
      );
      return ok(undefined, decision === "approve" ? "Creator approved." : "Request declined.");
    });
    return result;
  });
}

export async function countJoinRequests(ctx: OrgContext): Promise<number> {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(campaignMemberships)
    .where(and(eq(campaignMemberships.orgId, ctx.org.id), eq(campaignMemberships.status, "requested")));
  return Number(n);
}
