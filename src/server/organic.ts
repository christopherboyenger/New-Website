import "server-only";
import { and, asc, between, count, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { platformLabels, platforms as allPlatforms, type CampaignStatus, type Platform } from "@/domain/campaign";
import { eachDay, validateRange, type DateRange } from "@/domain/date-range";
import type { ContentFormat } from "@/domain/playbook-content";
import { cpmUsd } from "@/domain/reporting-math";
import type { CampaignSort, ComparisonDimension, PlaybookSort, PostMode, RangeMetric, ReviewFilter, SortOrder } from "@/domain/organic-url-state";
import { fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { NotFoundError, requireOrgAction } from "./authz";
import { getDb, type Db } from "./db/client";
import { campaigns, playbooks, postDailyMetrics, posts, reviewStatuses, type PlaybookStatus } from "./db/schema";
import { createPlaybookDraft } from "./playbooks-core";
import { dailyReport, postSorts, queryPosts, type DailyRow, type PostPage, type PostSort } from "./reporting";

/**
 * Data for the Organic page (L02–L04, L23, L33–L36). Every function takes the
 * orgId from an authorized context (requireOrgPage / requireOrgAction) and
 * qualifies every table with it; IDs from the URL only select within the org.
 *
 * Count rules (docs/decisions/reporting.md):
 * - Views, Spend and CPM are earned within the UTC date range by APPROVED
 *   posts (post_daily_metrics); CPM is recomputed from totals (weighted).
 * - Posts / Creators in the tables are approved posts with at least one daily
 *   metric row in the range and their unique creators (API `posts`/`creators`).
 * - Playbooks counts every playbook attached to the campaign, drafts included.
 */

export const TABLE_PAGE_SIZE = 25;
export const POSTS_PAGE_SIZE = 24;
export const MAX_COMPARISON_SERIES = 5;

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

const toNumber = (value: unknown) => Number(value ?? 0);

function orderBy(expr: SQL, order: SortOrder): SQL {
  return order === "asc" ? sql`${expr} asc nulls last` : sql`${expr} desc nulls last`;
}

/** Approved-post metrics earned within the range, grouped by the given post column. */
function rangeMetricsBy(db: Db, orgId: string, range: DateRange, column: typeof posts.campaignId | typeof posts.playbookId, alias: string) {
  return db
    .select({
      key: sql<string>`${column}`.as(`${alias}_key`),
      views: sql<number>`sum(${postDailyMetrics.views})`.as(`${alias}_views`),
      spendCents: sql<number>`sum(${postDailyMetrics.spendCents})`.as(`${alias}_spend`),
      postCount: sql<number>`count(distinct ${posts.id})`.as(`${alias}_posts`),
      creatorCount: sql<number>`count(distinct ${posts.creatorId})`.as(`${alias}_creators`),
    })
    .from(postDailyMetrics)
    .innerJoin(posts, eq(posts.id, postDailyMetrics.postId))
    .where(
      and(
        eq(postDailyMetrics.orgId, orgId),
        eq(posts.orgId, orgId),
        between(postDailyMetrics.day, range.from, range.to),
        eq(posts.reviewStatus, "approved"),
        isNotNull(column),
      ),
    )
    .groupBy(column)
    .as(alias);
}

/** Platforms a campaign targets; an empty list means every supported platform. */
function targetedPlatforms(targeting: { platforms?: Platform[] } | null): Platform[] {
  const list = targeting?.platforms ?? [];
  return list.length ? allPlatforms.filter((p) => list.includes(p)) : [];
}

/* ----------------------------------------------------------------------------
 * Header counts and filter labels
 * ------------------------------------------------------------------------- */

export interface OrganicCounts {
  campaigns: number;
  /** All playbooks (drafts included), or those of the filtered campaign. */
  playbooks: number;
}

export async function loadOrganicCounts(orgId: string, campaignFilter: string | null): Promise<OrganicCounts> {
  const db = await getDb();
  const [[c], [p]] = await Promise.all([
    db.select({ n: count() }).from(campaigns).where(eq(campaigns.orgId, orgId)),
    db
      .select({ n: count() })
      .from(playbooks)
      .where(and(eq(playbooks.orgId, orgId), campaignFilter ? eq(playbooks.campaignId, campaignFilter) : undefined)),
  ]);
  return { campaigns: c.n, playbooks: p.n };
}

export interface FilterLabel {
  id: string;
  label: string;
  /** False when the ID is not one of this workspace's records (nonexistent and inaccessible look the same). */
  found: boolean;
}

/** Display names for the active campaign/playbook filters; the "0" sentinels are Unattributed / Custom posts. */
export async function resolveFilterLabels(orgId: string, filter: { campaign: string | null; playbook: string | null }) {
  const db = await getDb();
  const [campaign, playbook] = await Promise.all([
    filter.campaign && filter.campaign !== "0"
      ? db
          .select({ name: campaigns.name })
          .from(campaigns)
          .where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, filter.campaign)))
          .limit(1)
      : Promise.resolve([]),
    filter.playbook && filter.playbook !== "0"
      ? db
          .select({ name: playbooks.name })
          .from(playbooks)
          .where(and(eq(playbooks.orgId, orgId), eq(playbooks.id, filter.playbook)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const label = (id: string | null, rows: Array<{ name: string }>, sentinel: string, missing: string): FilterLabel | null => {
    if (!id) return null;
    if (id === "0") return { id, label: sentinel, found: true };
    return rows[0] ? { id, label: rows[0].name, found: true } : { id, label: missing, found: false };
  };
  return {
    campaign: label(filter.campaign, campaign, "Unattributed", "Unknown campaign"),
    playbook: label(filter.playbook, playbook, "Custom posts", "Unknown playbook"),
  };
}

export interface ChoiceOption {
  id: string;
  name: string;
}

/** Filter choices for the Posts tab. Playbooks narrow to the filtered campaign. */
export async function loadFilterChoices(orgId: string, campaignFilter: string | null): Promise<{ campaigns: ChoiceOption[]; playbooks: ChoiceOption[] }> {
  const db = await getDb();
  const [c, p] = await Promise.all([
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.orgId, orgId)).orderBy(asc(campaigns.name), asc(campaigns.id)),
    db
      .select({ id: playbooks.id, name: playbooks.name })
      .from(playbooks)
      .where(and(eq(playbooks.orgId, orgId), campaignFilter && campaignFilter !== "0" ? eq(playbooks.campaignId, campaignFilter) : undefined))
      .orderBy(asc(playbooks.name), asc(playbooks.id)),
  ]);
  return { campaigns: c, playbooks: p };
}

/* ----------------------------------------------------------------------------
 * Campaigns tab (L03)
 * ------------------------------------------------------------------------- */

export interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  version: number;
  createdAt: string;
  pricingMode: "daily" | "manual";
  dailyBudgetCents: number;
  /** Empty = all platforms. */
  platforms: Platform[];
  views: number;
  spendCents: number;
  cpmUsd: number | null;
  playbooks: number;
  posts: number;
  creators: number;
  avgViewsPerPost: number | null;
}

export async function listCampaignRows(
  orgId: string,
  params: {
    range: DateRange;
    sort: CampaignSort;
    order: SortOrder;
    page: number;
    pageSize?: number;
  },
): Promise<Paged<CampaignRow>> {
  const db = await getDb();
  const pageSize = params.pageSize ?? TABLE_PAGE_SIZE;
  const m = rangeMetricsBy(db, orgId, params.range, posts.campaignId, "m");
  const pb = db
    .select({
      campaignId: sql<string>`${playbooks.campaignId}`.as("pb_campaign"),
      n: sql<number>`count(*)`.as("pb_count"),
    })
    .from(playbooks)
    .where(eq(playbooks.orgId, orgId))
    .groupBy(playbooks.campaignId)
    .as("pb");

  const views = sql`coalesce(${m.views}, 0)`;
  const spend = sql`coalesce(${m.spendCents}, 0)`;
  const sortExpr: Record<CampaignSort, SQL> = {
    active: sql`case ${campaigns.status} when 'active' then 2 when 'paused' then 1 else 0 end`,
    name: sql`lower(${campaigns.name})`,
    views,
    spend,
    cpm: sql`${m.spendCents}::float8 / nullif(${m.views}, 0)`,
    playbooks: sql`coalesce(${pb.n}, 0)`,
    posts: sql`coalesce(${m.postCount}, 0)`,
    creators: sql`coalesce(${m.creatorCount}, 0)`,
    avg_views: sql`${m.views}::float8 / nullif(${m.postCount}, 0)`,
  };

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(campaigns).where(eq(campaigns.orgId, orgId)),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        version: campaigns.version,
        createdAt: campaigns.createdAt,
        pricingMode: campaigns.pricingMode,
        dailyBudgetCents: campaigns.dailyBudgetCents,
        targeting: campaigns.targeting,
        views: sql<number>`${views}::bigint`.mapWith(toNumber),
        spendCents: sql<number>`${spend}::bigint`.mapWith(toNumber),
        playbooks: sql<number>`coalesce(${pb.n}, 0)::int`.mapWith(toNumber),
        posts: sql<number>`coalesce(${m.postCount}, 0)::int`.mapWith(toNumber),
        creators: sql<number>`coalesce(${m.creatorCount}, 0)::int`.mapWith(toNumber),
      })
      .from(campaigns)
      .leftJoin(m, eq(m.key, campaigns.id))
      .leftJoin(pb, eq(pb.campaignId, campaigns.id))
      .where(eq(campaigns.orgId, orgId))
      .orderBy(orderBy(sortExpr[params.sort], params.order), asc(sql`lower(${campaigns.name})`), asc(campaigns.id))
      .limit(pageSize)
      .offset((params.page - 1) * pageSize),
  ]);

  return {
    total,
    page: params.page,
    pageSize,
    rows: rows.map(({ targeting, createdAt, ...r }) => ({
      ...r,
      createdAt: createdAt.toISOString(),
      platforms: targetedPlatforms(targeting),
      cpmUsd: cpmUsd(r.spendCents, r.views),
      avgViewsPerPost: r.posts > 0 ? r.views / r.posts : null,
    })),
  };
}

/* ----------------------------------------------------------------------------
 * Playbooks tab (L04)
 * ------------------------------------------------------------------------- */

export interface PlaybookRow {
  id: string;
  name: string;
  status: PlaybookStatus;
  active: boolean;
  format: ContentFormat;
  updatedAt: string;
  campaignId: string;
  campaignName: string;
  campaignStatus: CampaignStatus;
  /** The campaign's targeted platforms; empty = all platforms. */
  platforms: Platform[];
  views: number;
  spendCents: number;
  cpmUsd: number | null;
  posts: number;
  creators: number;
  avgViewsPerPost: number | null;
}

export async function listPlaybookRows(
  orgId: string,
  params: {
    range: DateRange;
    campaignId: string | null;
    sort: PlaybookSort;
    order: SortOrder;
    page: number;
    pageSize?: number;
  },
): Promise<Paged<PlaybookRow>> {
  const db = await getDb();
  const pageSize = params.pageSize ?? TABLE_PAGE_SIZE;
  const m = rangeMetricsBy(db, orgId, params.range, posts.playbookId, "m");
  const where = and(eq(playbooks.orgId, orgId), params.campaignId ? eq(playbooks.campaignId, params.campaignId) : undefined);

  const sortExpr: Record<PlaybookSort, SQL> = {
    active: sql`case when ${playbooks.status} = 'published' and ${playbooks.active} then 2 when ${playbooks.status} = 'published' then 1 else 0 end`,
    name: sql`lower(${playbooks.name})`,
    views: sql`coalesce(${m.views}, 0)`,
    spend: sql`coalesce(${m.spendCents}, 0)`,
    cpm: sql`${m.spendCents}::float8 / nullif(${m.views}, 0)`,
    posts: sql`coalesce(${m.postCount}, 0)`,
    creators: sql`coalesce(${m.creatorCount}, 0)`,
    avg_views: sql`${m.views}::float8 / nullif(${m.postCount}, 0)`,
  };

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(playbooks).where(where),
    db
      .select({
        id: playbooks.id,
        name: playbooks.name,
        status: playbooks.status,
        active: playbooks.active,
        format: playbooks.format,
        updatedAt: playbooks.updatedAt,
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        campaignStatus: campaigns.status,
        targeting: campaigns.targeting,
        views: sql<number>`coalesce(${m.views}, 0)::bigint`.mapWith(toNumber),
        spendCents: sql<number>`coalesce(${m.spendCents}, 0)::bigint`.mapWith(toNumber),
        posts: sql<number>`coalesce(${m.postCount}, 0)::int`.mapWith(toNumber),
        creators: sql<number>`coalesce(${m.creatorCount}, 0)::int`.mapWith(toNumber),
      })
      .from(playbooks)
      .innerJoin(campaigns, and(eq(campaigns.id, playbooks.campaignId), eq(campaigns.orgId, orgId)))
      .leftJoin(m, eq(m.key, playbooks.id))
      .where(where)
      .orderBy(orderBy(sortExpr[params.sort], params.order), asc(sql`lower(${playbooks.name})`), asc(playbooks.id))
      .limit(pageSize)
      .offset((params.page - 1) * pageSize),
  ]);

  return {
    total,
    page: params.page,
    pageSize,
    rows: rows.map(({ targeting, updatedAt, ...r }) => ({
      ...r,
      updatedAt: updatedAt.toISOString(),
      platforms: targetedPlatforms(targeting),
      cpmUsd: cpmUsd(r.spendCents, r.views),
      avgViewsPerPost: r.posts > 0 ? r.views / r.posts : null,
    })),
  };
}

/* ----------------------------------------------------------------------------
 * Posts tab (L02, L33–L35)
 * ------------------------------------------------------------------------- */

export interface PostFilters {
  /** Campaign ID, "0" = unattributed. */
  campaign: string | null;
  /** Playbook ID, "0" = Custom posts. */
  playbook: string | null;
  platform: Platform | null;
}

function sentinelCondition(column: typeof posts.campaignId | typeof posts.playbookId, id: string | null): SQL | undefined {
  if (!id) return undefined;
  return id === "0" ? isNull(column) : eq(column, id);
}

/**
 * Filters for range metrics (cards, chart). Like the daily report, no
 * campaign filter means every approved post, unattributed ones included.
 */
function metricFilterConditions(filters: PostFilters): Array<SQL | undefined> {
  return [
    sentinelCondition(posts.campaignId, filters.campaign),
    sentinelCondition(posts.playbookId, filters.playbook),
    filters.platform ? eq(posts.platform, filters.platform) : undefined,
  ];
}

/**
 * The post set of the list (post-drilldown semantics): created in range
 * (posted_at, else submitted_at) or with views gained in range; no campaign
 * filter excludes unattributed posts.
 */
function listScopeConditions(orgId: string, scope: PostFilters & { range: DateRange; mode: PostMode }): Array<SQL | undefined> {
  const postedOrSubmitted = sql`coalesce(${posts.postedAt}, ${posts.submittedAt})`;
  const start = new Date(`${scope.range.from}T00:00:00.000Z`);
  const endExclusive = new Date(new Date(`${scope.range.to}T00:00:00.000Z`).getTime() + 86_400_000);
  return [
    scope.campaign ? sentinelCondition(posts.campaignId, scope.campaign) : isNotNull(posts.campaignId),
    sentinelCondition(posts.playbookId, scope.playbook),
    scope.platform ? eq(posts.platform, scope.platform) : undefined,
    scope.mode === "created"
      ? and(sql`${postedOrSubmitted} >= ${start}`, sql`${postedOrSubmitted} < ${endExclusive}`)
      : sql`exists (select 1 from ${postDailyMetrics} where ${postDailyMetrics.postId} = ${posts.id} and ${postDailyMetrics.orgId} = ${orgId} and ${postDailyMetrics.day} between ${scope.range.from} and ${scope.range.to} and ${postDailyMetrics.views} > 0)`,
  ];
}

export interface PostMetricSummary {
  /**
   * `awaiting_metrics`: approved posts exist but no metrics source has ever
   * reported for this workspace — metrics are unavailable, never zero (DEC-013).
   */
  status: "available" | "awaiting_metrics";
  range: {
    views: number;
    spendCents: number;
    cpmUsd: number | null;
    posts: number;
    creators: number;
  };
  lifetime: {
    /** Approved posts in the list scope (mode + filters, without search). */
    postCount: number;
    /** null = no post in scope has that counter observed yet (unavailable, not zero). */
    likes: number | null;
    comments: number | null;
    bookmarks: number | null;
    shares: number | null;
    /** Weighted: lifetime interactions ÷ lifetime views over posts with both observed; 0–1 fraction. */
    engagement: number | null;
  };
}

export async function loadPostMetricSummary(orgId: string, scope: PostFilters & { range: DateRange; mode: PostMode }): Promise<PostMetricSummary> {
  const db = await getDb();
  const anyCounter = sql`(${posts.likes} is not null or ${posts.comments} is not null or ${posts.bookmarks} is not null or ${posts.shares} is not null)`;
  const engaged = sql`${posts.views} > 0 and ${anyCounter}`;
  const [[range], [lifetime], awaiting] = await Promise.all([
    db
      .select({
        views: sql<number>`coalesce(sum(${postDailyMetrics.views}), 0)::bigint`.mapWith(toNumber),
        spendCents: sql<number>`coalesce(sum(${postDailyMetrics.spendCents}), 0)::bigint`.mapWith(toNumber),
        posts: sql<number>`count(distinct ${posts.id})::int`.mapWith(toNumber),
        creators: sql<number>`count(distinct ${posts.creatorId})::int`.mapWith(toNumber),
      })
      .from(postDailyMetrics)
      .innerJoin(posts, eq(posts.id, postDailyMetrics.postId))
      .where(
        and(
          eq(postDailyMetrics.orgId, orgId),
          eq(posts.orgId, orgId),
          eq(posts.reviewStatus, "approved"),
          between(postDailyMetrics.day, scope.range.from, scope.range.to),
          ...metricFilterConditions(scope),
        ),
      ),
    db
      .select({
        postCount: sql<number>`count(*)::int`.mapWith(toNumber),
        likes: sql<number | null>`sum(${posts.likes})::bigint`,
        comments: sql<number | null>`sum(${posts.comments})::bigint`,
        bookmarks: sql<number | null>`sum(${posts.bookmarks})::bigint`,
        shares: sql<number | null>`sum(${posts.shares})::bigint`,
        interactions: sql<
          number | null
        >`sum(case when ${engaged} then coalesce(${posts.likes},0) + coalesce(${posts.comments},0) + coalesce(${posts.bookmarks},0) + coalesce(${posts.shares},0) end)::bigint`,
        engagedViews: sql<number | null>`sum(case when ${engaged} then ${posts.views} end)::bigint`,
      })
      .from(posts)
      .where(and(eq(posts.orgId, orgId), eq(posts.reviewStatus, "approved"), ...listScopeConditions(orgId, scope))),
    awaitingFirstMetrics(orgId),
  ]);
  const nullable = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const engagedViews = nullable(lifetime.engagedViews);
  return {
    status: awaiting ? "awaiting_metrics" : "available",
    range: { ...range, cpmUsd: cpmUsd(range.spendCents, range.views) },
    lifetime: {
      postCount: lifetime.postCount,
      likes: nullable(lifetime.likes),
      comments: nullable(lifetime.comments),
      bookmarks: nullable(lifetime.bookmarks),
      shares: nullable(lifetime.shares),
      engagement: engagedViews ? (nullable(lifetime.interactions) ?? 0) / engagedViews : null,
    },
  };
}

/** True when the workspace has approved posts but no daily metric row has ever been recorded (DEC-013). */
export async function awaitingFirstMetrics(orgId: string): Promise<boolean> {
  const db = await getDb();
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.orgId, orgId), eq(posts.reviewStatus, "approved")))
    .limit(1);
  if (!post) return false;
  const [metric] = await db.select({ postId: postDailyMetrics.postId }).from(postDailyMetrics).where(eq(postDailyMetrics.orgId, orgId)).limit(1);
  return !metric;
}

/** Whether the workspace has any post at all (any review status), to tell "no posts yet" from "no posts match". */
export async function workspaceHasPosts(orgId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ id: posts.id }).from(posts).where(eq(posts.orgId, orgId)).limit(1);
  return Boolean(row);
}

export interface PostListParams extends PostFilters {
  range: DateRange;
  mode: PostMode;
  review: ReviewFilter | null;
  q: string;
  sort: string;
  order: SortOrder;
  page: number;
  pageSize?: number;
}

/** The post list (all three review statuses for the brand UI unless filtered), via the reporting drilldown. */
export async function loadPostsPage(orgId: string, params: PostListParams): Promise<PostPage> {
  const sort: PostSort = postSorts.find((s) => s === params.sort) ?? "posted";
  return queryPosts(orgId, {
    range: params.range,
    mode: params.mode,
    campaignIds: params.campaign ? [params.campaign] : undefined,
    playbookIds: params.playbook ? [params.playbook] : undefined,
    platforms: params.platform ? [params.platform] : undefined,
    search: params.q || undefined,
    reviewStatuses: params.review ? [params.review] : [...reviewStatuses],
    page: params.page,
    pageSize: params.pageSize ?? POSTS_PAGE_SIZE,
    sort,
    order: params.order,
  });
}

/** The Posts tab count: posts listed for the range, mode and filters (search excluded). */
export async function countListedPosts(orgId: string, params: Omit<PostListParams, "q" | "sort" | "order" | "page" | "pageSize">): Promise<number> {
  const page = await loadPostsPage(orgId, {
    ...params,
    q: "",
    sort: "posted",
    order: "desc",
    page: 1,
    pageSize: 1,
  });
  return page.meta.total;
}

/* ----------------------------------------------------------------------------
 * Daily chart (range metrics only; lifetime counters have no daily series)
 * ------------------------------------------------------------------------- */

export interface ChartPoint {
  day: string;
  /** null = not computable that day (CPM with zero views). */
  value: number | null;
}

export interface ChartSeries {
  /** Entity ID / platform, "0" for the Unattributed / Custom posts sentinel, "all" without comparison. */
  key: string;
  label: string;
  points: ChartPoint[];
  /** Range total for the series (weighted CPM; posts/creators deduplicated across the range). */
  total: number | null;
}

export interface DailyChartData {
  metric: RangeMetric;
  comparison: ComparisonDimension;
  series: ChartSeries[];
  /** Groups with data in the range; only the largest MAX_COMPARISON_SERIES are drawn. */
  groupCount: number;
}

interface Agg {
  views: number;
  spendCents: number;
  posts: number;
  creators: number;
}

function metricValue(metric: RangeMetric, a: Agg): number | null {
  switch (metric) {
    case "views":
      return a.views;
    case "spend":
      return a.spendCents;
    case "cpm":
      return cpmUsd(a.spendCents, a.views);
    case "posts":
      return a.posts;
    case "creators":
      return a.creators;
  }
}

const zeroAgg: Agg = { views: 0, spendCents: 0, posts: 0, creators: 0 };

/**
 * Daily series for one range metric. Spend values are cents. Every UTC day of
 * the range is present (a day without rows is a confirmed zero; CPM is null).
 * With a comparison, the groups with the largest range value are drawn.
 */
export async function loadDailyChart(
  orgId: string,
  params: PostFilters & {
    range: DateRange;
    metric: RangeMetric;
    comparison: ComparisonDimension;
  },
): Promise<DailyChartData> {
  const db = await getDb();
  const days = eachDay(params.range);
  const groupColumn: SQL | null =
    params.comparison === "campaign"
      ? sql`${posts.campaignId}`
      : params.comparison === "playbook"
        ? sql`${posts.playbookId}`
        : params.comparison === "platform"
          ? sql`${posts.platform}`
          : null;
  const base = and(
    eq(postDailyMetrics.orgId, orgId),
    eq(posts.orgId, orgId),
    eq(posts.reviewStatus, "approved"),
    between(postDailyMetrics.day, params.range.from, params.range.to),
    ...metricFilterConditions(params),
  );
  const aggCols = {
    views: sql<number>`coalesce(sum(${postDailyMetrics.views}), 0)::bigint`.mapWith(toNumber),
    spendCents: sql<number>`coalesce(sum(${postDailyMetrics.spendCents}), 0)::bigint`.mapWith(toNumber),
    posts: sql<number>`count(distinct ${posts.id})::int`.mapWith(toNumber),
    creators: sql<number>`count(distinct ${posts.creatorId})::int`.mapWith(toNumber),
  };

  if (!groupColumn) {
    const [rows, [totals]] = await Promise.all([
      db
        .select({ day: postDailyMetrics.day, ...aggCols })
        .from(postDailyMetrics)
        .innerJoin(posts, eq(posts.id, postDailyMetrics.postId))
        .where(base)
        .groupBy(postDailyMetrics.day),
      db.select(aggCols).from(postDailyMetrics).innerJoin(posts, eq(posts.id, postDailyMetrics.postId)).where(base),
    ]);
    const byDay = new Map(rows.map((r) => [r.day, r]));
    return {
      metric: params.metric,
      comparison: "none",
      groupCount: rows.length ? 1 : 0,
      series: [
        {
          key: "all",
          label: "All approved posts",
          points: days.map((day) => ({
            day,
            value: metricValue(params.metric, byDay.get(day) ?? zeroAgg),
          })),
          total: metricValue(params.metric, totals ?? zeroAgg),
        },
      ],
    };
  }

  const groupTotals = await db
    .select({ key: sql<string | null>`${groupColumn}`, ...aggCols })
    .from(postDailyMetrics)
    .innerJoin(posts, eq(posts.id, postDailyMetrics.postId))
    .where(base)
    .groupBy(groupColumn);
  const rankBy = (a: Agg) => (params.metric === "cpm" ? a.spendCents : (metricValue(params.metric, a) ?? 0));
  const top = [...groupTotals]
    .sort((a, b) => rankBy(b) - rankBy(a) || b.views - a.views || String(a.key).localeCompare(String(b.key)))
    .slice(0, MAX_COMPARISON_SERIES);
  if (!top.length)
    return {
      metric: params.metric,
      comparison: params.comparison,
      groupCount: 0,
      series: [],
    };

  const keys = top.map((t) => t.key).filter((k): k is string => k !== null);
  const includeNull = top.some((t) => t.key === null);
  const keyCondition = or(
    keys.length
      ? sql`${groupColumn} in (${sql.join(
          keys.map((k) => sql`${k}`),
          sql`, `,
        )})`
      : undefined,
    includeNull ? sql`${groupColumn} is null` : undefined,
  );
  const rows = await db
    .select({
      day: postDailyMetrics.day,
      key: sql<string | null>`${groupColumn}`,
      ...aggCols,
    })
    .from(postDailyMetrics)
    .innerJoin(posts, eq(posts.id, postDailyMetrics.postId))
    .where(and(base, keyCondition))
    .groupBy(postDailyMetrics.day, groupColumn);

  const labels = await groupLabels(orgId, params.comparison, keys);
  const series: ChartSeries[] = top.map((group) => {
    const byDay = new Map(rows.filter((r) => r.key === group.key).map((r) => [r.day, r]));
    return {
      key: group.key ?? "0",
      label: group.key === null ? (params.comparison === "playbook" ? "Custom posts" : "Unattributed") : (labels.get(group.key) ?? "Unknown"),
      points: days.map((day) => ({
        day,
        value: metricValue(params.metric, byDay.get(day) ?? zeroAgg),
      })),
      total: metricValue(params.metric, group),
    };
  });
  return {
    metric: params.metric,
    comparison: params.comparison,
    groupCount: groupTotals.length,
    series,
  };
}

async function groupLabels(orgId: string, dimension: ComparisonDimension, keys: string[]): Promise<Map<string, string>> {
  if (dimension === "platform") return new Map(keys.map((k) => [k, platformLabels[k as Platform] ?? k]));
  if (!keys.length) return new Map();
  const db = await getDb();
  const table = dimension === "campaign" ? campaigns : playbooks;
  const rows = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(and(eq(table.orgId, orgId), inArray(table.id, keys)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/* ----------------------------------------------------------------------------
 * Create Playbook dialog (L23)
 * ------------------------------------------------------------------------- */

export interface CampaignChoice {
  id: string;
  name: string;
  status: CampaignStatus;
}

export async function listCampaignChooser(orgId: string): Promise<CampaignChoice[]> {
  const db = await getDb();
  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .orderBy(asc(campaigns.name), asc(campaigns.id));
}

const createPlaybookInput = z.object({
  campaignId: z.string().trim().min(1, "Choose a campaign.").max(64),
});

/** Creates a DRAFT playbook for one of the org's campaigns (playbook:edit). Never publishes or activates. */
export async function createPlaybookForSlug(slug: string, raw: unknown): Promise<ActionResult<{ playbookId: string; editHref: string }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "playbook:edit");
    const parsed = createPlaybookInput.safeParse(raw);
    if (!parsed.success) return fromZodError(parsed.error, "Choose which campaign this playbook is for.");
    const draft = await createPlaybookDraft(ctx, {
      campaignId: parsed.data.campaignId,
    });
    return ok(
      {
        playbookId: draft.id,
        editHref: `/home/${ctx.org.slug}/playbooks/${draft.id}/edit`,
      },
      "Draft playbook created.",
    );
  });
}

/* ----------------------------------------------------------------------------
 * Breakdown dialog: daily rows for selected campaigns or one/more playbooks
 * ------------------------------------------------------------------------- */

export interface BreakdownDay {
  date: string;
  views: number;
  spendCents: number;
  cpmUsd: number | null;
  posts: number;
  creators: number;
}

export interface Breakdown {
  names: string[];
  range: DateRange;
  /** Only days with views or spend (DEC-011: sparse daily rows). */
  days: BreakdownDay[];
  totals: Omit<BreakdownDay, "date">;
}

const breakdownInput = z.object({
  kind: z.enum(["campaign", "playbook"]),
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(100),
  from: z.string(),
  to: z.string(),
});

const usdToCents = (usd: number | undefined) => Math.round((usd ?? 0) * 100);

function toBreakdownDay(row: DailyRow): BreakdownDay {
  const spendCents = usdToCents(row.spend);
  return {
    date: row.date,
    views: row.views ?? 0,
    spendCents,
    cpmUsd: cpmUsd(spendCents, row.views ?? 0),
    posts: row.posts ?? 0,
    creators: row.creators ?? 0,
  };
}

/** Daily report for the given campaigns or playbooks (workspace:read). Every ID must belong to the workspace. */
export async function loadBreakdownForSlug(slug: string, raw: unknown): Promise<ActionResult<Breakdown>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "workspace:read");
    const parsed = breakdownInput.safeParse(raw);
    if (!parsed.success) return fromZodError(parsed.error, "That breakdown request was not valid.");
    const range = validateRange(parsed.data.from, parsed.data.to);
    if (!range.ok) return fail(range.error);
    const ids = [...new Set(parsed.data.ids)];
    const db = await getDb();
    const table = parsed.data.kind === "campaign" ? campaigns : playbooks;
    const owned = await db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(and(eq(table.orgId, ctx.org.id), inArray(table.id, ids)))
      .orderBy(asc(table.name));
    if (owned.length !== ids.length) throw new NotFoundError(parsed.data.kind === "campaign" ? "Campaign not found." : "Playbook not found.");
    const report = await dailyReport(ctx.org.id, {
      range: range.range,
      groupBy: [],
      ...(parsed.data.kind === "campaign" ? { campaignIds: ids } : { playbookIds: ids }),
      metrics: ["views", "spend", "cpm", "posts", "creators"],
    });
    const totalsSpend = usdToCents(report.totals.spend);
    return ok({
      names: owned.map((o) => o.name),
      range: range.range,
      days: report.data.filter((r) => (r.views ?? 0) > 0 || (r.spend ?? 0) > 0).map(toBreakdownDay),
      totals: {
        views: report.totals.views ?? 0,
        spendCents: totalsSpend,
        cpmUsd: cpmUsd(totalsSpend, report.totals.views ?? 0),
        posts: report.totals.posts ?? 0,
        creators: report.totals.creators ?? 0,
      },
    });
  });
}
