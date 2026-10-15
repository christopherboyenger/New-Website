"use server";

/**
 * Ads (L08, L37) and Create ads (L38): the ad-launch list, direct creator
 * submissions, and the launch-draft step of the paid-ad saga
 * (production-integration-contracts.md §6).
 *
 * This deployment has no ad-provider launch or reporting adapter. So:
 * - "Save draft" stores an `ad_launches` row in stage `draft` and nothing
 *   else — no provider call, no activation, no spend;
 * - no performance numbers are shown for any ad.
 *
 * A draft needs a connected installation (status `connected`) for the chosen
 * provider, an eligible source with recorded paid-use rights, and the ad
 * settings version the form was built from (stale defaults → conflict).
 * Every export re-authorizes from the URL slug; every query is qualified with
 * the authorized org.
 */
import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, lt, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, dayToDate, type DateRange } from "@/domain/date-range";
import { generateAdName, resolveAdName } from "@/domain/ad-naming";
import { MAX_COPY_LENGTH, providerPlatform, resolveTrackingUrl, tokensIn, type AdProvider } from "@/domain/tracking-params";
import type { Platform } from "@/domain/campaign";
import { isValidCta } from "@/components/ads/cta-catalog";
import { newId } from "@/lib/ids";
import { ConflictError, fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { loadAdDefaultsForLaunch, type AdDefaults } from "./ad-settings";
import { recordAudit } from "./audit";
import { hasPermission, NotFoundError, requireOrgAction } from "./authz";
import { getDb, type DbLike } from "./db/client";
import {
  adLaunches,
  adLaunchStages,
  adRightsGrants,
  adSubmissions,
  campaigns,
  creators,
  integrationInstallations,
  posts,
  type IntegrationStatus,
} from "./db/schema";

export type AdLaunchStage = (typeof adLaunchStages)[number];

const ADS_PAGE_SIZE = 25;
const CANDIDATE_LIMIT = 100;
const adProviders: AdProvider[] = ["meta_ads", "tiktok_ads"];

export interface AdConnection {
  provider: AdProvider;
  status: IntegrationStatus;
  /** First selected ad account, when the provider connection recorded one. */
  accountName: string | null;
}

export interface AdConnectionState {
  installations: AdConnection[];
  /** Providers whose installation is verified `connected`. */
  connected: AdProvider[];
}

export interface AdLaunchRow {
  id: string;
  adName: string;
  provider: AdProvider;
  stage: AdLaunchStage;
  cta: string | null;
  source: { kind: "post" | "submission"; creatorName: string | null; handle: string | null; platform: Platform | null };
  createdAt: string;
}

export interface AdSubmissionRow {
  id: string;
  creatorName: string | null;
  note: string;
  status: "submitted" | "accepted" | "declined";
  rightsGrantedAt: string | null;
  rightsExpiresAt: string | null;
  hasMedia: boolean;
  createdAt: string;
}

export type AdsView = "all" | "submissions";

export interface AdsOverview {
  connection: AdConnectionState;
  canLaunch: boolean;
  view: AdsView;
  page: number;
  pageSize: number;
  total: number;
  launches: AdLaunchRow[];
  submissions: AdSubmissionRow[];
}

/* ------------------------------------------------------------------ helpers */

async function readConnections(db: DbLike, orgId: string): Promise<AdConnectionState> {
  const rows = await db
    .select({ provider: integrationInstallations.provider, status: integrationInstallations.status, selectedAssets: integrationInstallations.selectedAssets })
    .from(integrationInstallations)
    .where(and(eq(integrationInstallations.orgId, orgId), inArray(integrationInstallations.provider, adProviders)));
  const installations = rows
    .map((r) => ({ provider: r.provider as AdProvider, status: r.status, accountName: r.selectedAssets[0]?.name ?? null }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
  return { installations, connected: installations.filter((i) => i.status === "connected").map((i) => i.provider) };
}

function rangeBounds(range: DateRange) {
  return { start: dayToDate(range.from), end: dayToDate(addDays(range.to, 1)) };
}

/* ------------------------------------------------------------------ ads list */

export async function loadAdsOverview(slug: string, options: { view: AdsView; range: DateRange; page: number }): Promise<ActionResult<AdsOverview>> {
  return runAction<AdsOverview>(async () => {
    const ctx = await requireOrgAction(slug, "workspace:read");
    const db = await getDb();
    const orgId = ctx.org.id;
    const page = Number.isInteger(options.page) && options.page > 0 ? options.page : 1;
    const { start, end } = rangeBounds(options.range);
    const connection = await readConnections(db, orgId);
    const base: Omit<AdsOverview, "total"> = { connection, canLaunch: hasPermission(ctx, "ads:launch"), view: options.view, page, pageSize: ADS_PAGE_SIZE, launches: [], submissions: [] };

    if (options.view === "submissions") {
      const where = and(eq(adSubmissions.orgId, orgId), gte(adSubmissions.createdAt, start), lt(adSubmissions.createdAt, end));
      const [{ total }] = await db.select({ total: count() }).from(adSubmissions).where(where);
      const rows = await db
        .select({
          id: adSubmissions.id,
          creatorName: creators.displayName,
          note: adSubmissions.note,
          status: adSubmissions.status,
          rightsGrantedAt: adSubmissions.rightsGrantedAt,
          rightsExpiresAt: adSubmissions.rightsExpiresAt,
          mediaAssetId: adSubmissions.mediaAssetId,
          createdAt: adSubmissions.createdAt,
        })
        .from(adSubmissions)
        .leftJoin(creators, eq(creators.id, adSubmissions.creatorId))
        .where(where)
        .orderBy(desc(adSubmissions.createdAt), desc(adSubmissions.id))
        .limit(ADS_PAGE_SIZE)
        .offset((page - 1) * ADS_PAGE_SIZE);
      return ok({
        ...base,
        total,
        submissions: rows.map((r) => ({
          id: r.id,
          creatorName: r.creatorName,
          note: r.note,
          status: r.status,
          rightsGrantedAt: r.rightsGrantedAt?.toISOString() ?? null,
          rightsExpiresAt: r.rightsExpiresAt?.toISOString() ?? null,
          hasMedia: r.mediaAssetId !== null,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }

    const where = and(eq(adLaunches.orgId, orgId), gte(adLaunches.createdAt, start), lt(adLaunches.createdAt, end));
    const [{ total }] = await db.select({ total: count() }).from(adLaunches).where(where);
    const rows = await db
      .select({
        id: adLaunches.id,
        adName: adLaunches.adName,
        provider: adLaunches.provider,
        stage: adLaunches.stage,
        cta: adLaunches.cta,
        createdAt: adLaunches.createdAt,
        postId: adLaunches.postId,
        postHandle: posts.handle,
        postPlatform: posts.platform,
        postCreator: creators.displayName,
        submissionId: adLaunches.submissionId,
        submissionCreatorId: adSubmissions.creatorId,
      })
      .from(adLaunches)
      .leftJoin(posts, and(eq(posts.id, adLaunches.postId), eq(posts.orgId, orgId)))
      .leftJoin(adSubmissions, and(eq(adSubmissions.id, adLaunches.submissionId), eq(adSubmissions.orgId, orgId)))
      .leftJoin(creators, eq(creators.id, posts.creatorId))
      .where(where)
      .orderBy(desc(adLaunches.createdAt), desc(adLaunches.id))
      .limit(ADS_PAGE_SIZE)
      .offset((page - 1) * ADS_PAGE_SIZE);
    const submissionCreatorIds = [...new Set(rows.map((r) => r.submissionCreatorId).filter((v): v is string => v !== null))];
    const submissionCreators = submissionCreatorIds.length
      ? new Map(
          (await db.select({ id: creators.id, name: creators.displayName }).from(creators).where(inArray(creators.id, submissionCreatorIds))).map((c) => [c.id, c.name]),
        )
      : new Map<string, string>();

    return ok({
      ...base,
      total,
      launches: rows.map((r) => ({
        id: r.id,
        adName: r.adName,
        provider: r.provider,
        stage: r.stage,
        cta: r.cta,
        createdAt: r.createdAt.toISOString(),
        source: r.postId
          ? { kind: "post" as const, creatorName: r.postCreator, handle: r.postHandle, platform: r.postPlatform }
          : {
              kind: "submission" as const,
              creatorName: r.submissionCreatorId ? (submissionCreators.get(r.submissionCreatorId) ?? null) : null,
              handle: null,
              platform: null,
            },
      })),
    });
  });
}

/* ----------------------------------------------------------- launch drafts */

export interface ProviderEligibility {
  eligible: boolean;
  /** Why the source can't run on this provider; null when eligible. */
  reason: string | null;
}

export interface LaunchCandidate {
  kind: "post" | "submission";
  id: string;
  creatorName: string;
  handle: string | null;
  platform: Platform | null;
  caption: string;
  url: string | null;
  campaignHashtag: string | null;
  rightsSummary: string;
  eligibility: Record<AdProvider, ProviderEligibility>;
}

export interface LaunchDraftForm {
  org: { slug: string; name: string };
  connection: AdConnectionState;
  canLaunch: boolean;
  candidates: LaunchCandidate[];
  defaults: AdDefaults;
  settingsVersion: number;
  /** Today's UTC date used for generated names (ISO). */
  now: string;
}

const formatDay = (d: Date) => d.toISOString().slice(0, 10);

interface GrantRow {
  postId: string;
  providers: AdProvider[];
  evidenceKind: string;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  id: string;
}

/** Native placement: TikTok runs TikTok posts; Meta runs Instagram and Facebook posts. */
const nativePlatforms: Record<AdProvider, readonly Platform[]> = { tiktok_ads: ["tiktok"], meta_ads: ["instagram", "facebook_reels"] };
const providerName: Record<AdProvider, string> = { meta_ads: "Meta", tiktok_ads: "TikTok" };
const platformName: Record<Platform, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", snapchat: "Snapchat", facebook_reels: "Facebook" };

function postEligibility(post: { platform: Platform; externalId: string | null }, grants: GrantRow[], provider: AdProvider, now: Date): ProviderEligibility {
  if (!nativePlatforms[provider].includes(post.platform)) {
    return { eligible: false, reason: `${providerName[provider]} ads can't run ${platformName[post.platform]} posts.` };
  }
  if (!grants.length) return { eligible: false, reason: "No paid-use rights recorded from the creator." };
  const live = grants.filter((g) => !g.revokedAt && (!g.expiresAt || g.expiresAt > now));
  if (!live.length) {
    const revoked = grants.every((g) => g.revokedAt);
    return { eligible: false, reason: revoked ? "The creator revoked paid-use rights." : "Paid-use rights have expired." };
  }
  if (!live.some((g) => g.providers.includes(provider))) return { eligible: false, reason: `The creator's rights don't cover ${providerName[provider]}.` };
  if (!post.externalId) return { eligible: false, reason: `The post hasn't been matched to its ${platformName[post.platform]} ID yet.` };
  return { eligible: true, reason: null };
}

function submissionEligibility(sub: { status: string; rightsGrantedAt: Date | null; rightsExpiresAt: Date | null; mediaAssetId: string | null }, now: Date): ProviderEligibility {
  if (sub.status !== "accepted") return { eligible: false, reason: "Accept the submission first." };
  if (!sub.rightsGrantedAt) return { eligible: false, reason: "No paid-use rights recorded from the creator." };
  if (sub.rightsExpiresAt && sub.rightsExpiresAt <= now) return { eligible: false, reason: "Paid-use rights have expired." };
  if (!sub.mediaAssetId) return { eligible: false, reason: "The submission has no media file attached." };
  return { eligible: true, reason: null };
}

function rightsSummary(grants: Array<{ grantedAt: Date | null; expiresAt: Date | null; revokedAt?: Date | null }>, now: Date): string {
  const live = grants.filter((g) => g.grantedAt && !g.revokedAt && (!g.expiresAt || g.expiresAt > now));
  if (!grants.some((g) => g.grantedAt)) return "No rights recorded";
  if (!live.length) return "Rights not active";
  const expiries = live.map((g) => g.expiresAt);
  if (expiries.some((e) => e === null)) return "Rights granted, no expiry";
  const latest = new Date(Math.max(...expiries.map((e) => e!.getTime())));
  return `Rights until ${formatDay(latest)} (UTC)`;
}

async function loadCandidates(db: DbLike, orgId: string, now: Date): Promise<LaunchCandidate[]> {
  const postRows = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      handle: posts.handle,
      externalId: posts.externalId,
      caption: posts.caption,
      url: posts.url,
      creatorName: creators.displayName,
      hashtag: campaigns.primaryHashtag,
    })
    .from(posts)
    .innerJoin(creators, eq(creators.id, posts.creatorId))
    .leftJoin(campaigns, and(eq(campaigns.id, posts.campaignId), eq(campaigns.orgId, orgId)))
    .where(and(eq(posts.orgId, orgId), eq(posts.reviewStatus, "approved")))
    .orderBy(desc(posts.submittedAt), desc(posts.id))
    .limit(CANDIDATE_LIMIT);
  const grants = postRows.length ? await loadGrants(db, orgId, postRows.map((p) => p.id)) : [];
  const grantsByPost = new Map<string, GrantRow[]>();
  for (const g of grants) grantsByPost.set(g.postId, [...(grantsByPost.get(g.postId) ?? []), g]);

  const subRows = await db
    .select({
      id: adSubmissions.id,
      status: adSubmissions.status,
      note: adSubmissions.note,
      rightsGrantedAt: adSubmissions.rightsGrantedAt,
      rightsExpiresAt: adSubmissions.rightsExpiresAt,
      mediaAssetId: adSubmissions.mediaAssetId,
      creatorName: creators.displayName,
    })
    .from(adSubmissions)
    .leftJoin(creators, eq(creators.id, adSubmissions.creatorId))
    .where(and(eq(adSubmissions.orgId, orgId), notInArray(adSubmissions.status, ["declined"])))
    .orderBy(desc(adSubmissions.createdAt), desc(adSubmissions.id))
    .limit(CANDIDATE_LIMIT);

  const postCandidates: LaunchCandidate[] = postRows.map((p) => {
    const g = grantsByPost.get(p.id) ?? [];
    return {
      kind: "post",
      id: p.id,
      creatorName: p.creatorName,
      handle: p.handle,
      platform: p.platform,
      caption: p.caption,
      url: p.url,
      campaignHashtag: p.hashtag,
      rightsSummary: rightsSummary(g, now),
      eligibility: { meta_ads: postEligibility(p, g, "meta_ads", now), tiktok_ads: postEligibility(p, g, "tiktok_ads", now) },
    };
  });
  const subCandidates: LaunchCandidate[] = subRows.map((s) => {
    const e = submissionEligibility(s, now);
    return {
      kind: "submission",
      id: s.id,
      creatorName: s.creatorName ?? "Unknown creator",
      handle: null,
      platform: null,
      caption: s.note,
      url: null,
      campaignHashtag: null,
      rightsSummary: rightsSummary([{ grantedAt: s.rightsGrantedAt, expiresAt: s.rightsExpiresAt }], now),
      eligibility: { meta_ads: e, tiktok_ads: e },
    };
  });
  return [...postCandidates, ...subCandidates];
}

async function loadGrants(db: DbLike, orgId: string, postIds: string[]): Promise<GrantRow[]> {
  return db
    .select({
      id: adRightsGrants.id,
      postId: adRightsGrants.postId,
      providers: adRightsGrants.providers,
      evidenceKind: adRightsGrants.evidenceKind,
      grantedAt: adRightsGrants.grantedAt,
      expiresAt: adRightsGrants.expiresAt,
      revokedAt: adRightsGrants.revokedAt,
    })
    .from(adRightsGrants)
    .where(and(eq(adRightsGrants.orgId, orgId), inArray(adRightsGrants.postId, postIds)));
}

export async function loadLaunchDraftForm(slug: string): Promise<ActionResult<LaunchDraftForm>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "workspace:read");
    const db = await getDb();
    const connection = await readConnections(db, ctx.org.id);
    const canLaunch = hasPermission(ctx, "ads:launch");
    const defaults = await loadAdDefaultsForLaunch(slug);
    if (!defaults.ok) return defaults;
    const now = new Date();
    const candidates = connection.connected.length && canLaunch ? await loadCandidates(db, ctx.org.id, now) : [];
    return ok({
      org: { slug: ctx.org.slug, name: ctx.org.name },
      connection,
      canLaunch,
      candidates,
      defaults: defaults.data.settings,
      settingsVersion: defaults.data.version,
      now: now.toISOString(),
    });
  });
}

const draftInputSchema = z.object({
  provider: z.enum(["meta_ads", "tiktok_ads"], { message: "Choose where the ad runs." }),
  source: z.object({ kind: z.enum(["post", "submission"]), id: z.string().min(1).max(64) }, { message: "Choose a post or submission." }),
  bodyCopy: z
    .string()
    .trim()
    .min(1, "Write the body copy for this ad.")
    .max(MAX_COPY_LENGTH, `Keep copy to ${MAX_COPY_LENGTH.toLocaleString("en-US")} characters or fewer.`)
    .refine((v) => tokensIn(v).length === 0, { message: "Replace or remove every {{token}} before saving." }),
  adNameOverride: z.string().max(300).nullable(),
  cta: z.string().min(1, "Choose a call to action."),
  settingsVersion: z.number().int().min(0),
});
export type LaunchDraftInput = z.input<typeof draftInputSchema>;

export interface SavedLaunchDraft {
  id: string;
  adName: string;
  destinationUrl: string;
}

const openStages: AdLaunchStage[] = adLaunchStages.filter((s) => s !== "rejected" && s !== "failed");

/**
 * Stores a launch draft. Never calls a provider, activates, or spends:
 * the row stays in stage `draft` until a launch adapter exists.
 */
export async function saveLaunchDraft(slug: string, input: LaunchDraftInput): Promise<ActionResult<SavedLaunchDraft>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "ads:launch");
    const parsed = draftInputSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error, "Some fields need attention before this draft can be saved.");
    const data = parsed.data;
    const orgId = ctx.org.id;
    const db = await getDb();
    const now = new Date();
    const platform = providerPlatform[data.provider];

    const [installation] = await db
      .select({ id: integrationInstallations.id })
      .from(integrationInstallations)
      .where(and(eq(integrationInstallations.orgId, orgId), eq(integrationInstallations.provider, data.provider), eq(integrationInstallations.status, "connected")))
      .limit(1);
    if (!installation) {
      return fail(`Connect a ${providerName[data.provider]} ad account in Integrations before saving a ${providerName[data.provider]} draft.`, "validation", {
        provider: "This ad account isn't connected.",
      });
    }

    const defaults = await loadAdDefaultsForLaunch(slug);
    if (!defaults.ok) return defaults;
    if (defaults.data.version !== data.settingsVersion) {
      throw new ConflictError("Ad settings changed since you opened this page. Reload to build the draft from the current defaults.");
    }
    const settings = defaults.data.settings;
    if (!isValidCta(platform, data.cta)) return fail("Choose a call to action from the list.", "validation", { cta: "Choose a call to action from the list." });

    const destination = resolveTrackingUrl(settings.links, platform);
    if (!destination.url) {
      return fail("Add a website URL in Ad settings before saving a draft.", "validation", { destinationUrl: "No website URL in Ad settings." });
    }

    let creatorLabel: string;
    let rightsEvidence: Record<string, unknown>;
    let postId: string | null = null;
    let submissionId: string | null = null;

    if (data.source.kind === "post") {
      const [post] = await db
        .select({ id: posts.id, platform: posts.platform, externalId: posts.externalId, handle: posts.handle, reviewStatus: posts.reviewStatus })
        .from(posts)
        .where(and(eq(posts.orgId, orgId), eq(posts.id, data.source.id)))
        .limit(1);
      if (!post) throw new NotFoundError("Post not found.");
      if (post.reviewStatus !== "approved") return fail("Only approved posts can run as ads.", "validation", { source: "This post isn't approved." });
      const grants = await loadGrants(db, orgId, [post.id]);
      const eligibility = postEligibility(post, grants, data.provider, now);
      if (!eligibility.eligible) return fail(eligibility.reason!, "validation", { source: eligibility.reason! });
      const grant = grants.find((g) => !g.revokedAt && (!g.expiresAt || g.expiresAt > now) && g.providers.includes(data.provider))!;
      creatorLabel = post.handle;
      postId = post.id;
      rightsEvidence = {
        kind: "post_grant",
        grantId: grant.id,
        evidenceKind: grant.evidenceKind,
        grantedAt: grant.grantedAt.toISOString(),
        expiresAt: grant.expiresAt?.toISOString() ?? null,
        checkedAt: now.toISOString(),
      };
    } else {
      const [sub] = await db
        .select({
          id: adSubmissions.id,
          status: adSubmissions.status,
          rightsGrantedAt: adSubmissions.rightsGrantedAt,
          rightsExpiresAt: adSubmissions.rightsExpiresAt,
          mediaAssetId: adSubmissions.mediaAssetId,
          creatorName: creators.displayName,
        })
        .from(adSubmissions)
        .leftJoin(creators, eq(creators.id, adSubmissions.creatorId))
        .where(and(eq(adSubmissions.orgId, orgId), eq(adSubmissions.id, data.source.id)))
        .limit(1);
      if (!sub) throw new NotFoundError("Submission not found.");
      const eligibility = submissionEligibility(sub, now);
      if (!eligibility.eligible) return fail(eligibility.reason!, "validation", { source: eligibility.reason! });
      creatorLabel = sub.creatorName ?? "creator";
      submissionId = sub.id;
      rightsEvidence = {
        kind: "submission_rights",
        grantedAt: sub.rightsGrantedAt!.toISOString(),
        expiresAt: sub.rightsExpiresAt?.toISOString() ?? null,
        checkedAt: now.toISOString(),
      };
    }

    const generated = generateAdName({ convention: settings.naming, creator: creatorLabel, date: now, postId: (postId ?? submissionId)! });
    const name = resolveAdName(generated, data.adNameOverride);
    if (!name.ok) return fail(name.error, "validation", { adNameOverride: name.error });

    const [existing] = await db
      .select({ id: adLaunches.id })
      .from(adLaunches)
      .where(
        and(
          eq(adLaunches.orgId, orgId),
          eq(adLaunches.provider, data.provider),
          postId ? eq(adLaunches.postId, postId) : isNull(adLaunches.postId),
          submissionId ? eq(adLaunches.submissionId, submissionId) : isNull(adLaunches.submissionId),
          inArray(adLaunches.stage, openStages),
        ),
      )
      .limit(1);
    if (existing) throw new ConflictError(`There's already a ${providerName[data.provider]} ad for this ${data.source.kind}. Open it from Ads instead of creating another.`);

    const id = newId("adl");
    await db.insert(adLaunches).values({
      id,
      orgId,
      installationId: installation.id,
      provider: data.provider,
      postId,
      submissionId,
      adName: name.name,
      bodyCopy: data.bodyCopy,
      destinationUrl: destination.url,
      cta: data.cta,
      stage: "draft",
      rightsEvidence,
      createdByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    });
    await recordAudit({ orgId, actorUserId: ctx.user.id, action: "ad_launch.draft_create", targetType: "ad_launch", targetId: id, data: { provider: data.provider, source: data.source.kind } });
    revalidatePath(`/home/${ctx.org.slug}/ads`);
    return ok({ id, adName: name.name, destinationUrl: destination.url }, "Draft saved. Nothing was sent to the ad platform.");
  });
}
