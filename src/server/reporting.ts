import "server-only";
import { and, asc, between, count, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { cpmUsd, engagementRate } from "@/domain/reporting-math";
import type { DateRange } from "@/domain/date-range";
import type { Platform } from "@/domain/campaign";
import { executeRows, getDb } from "./db/client";
import {
  campaigns,
  installObservations,
  metricObservations,
  playbooks,
  postDailyMetrics,
  posts,
  type ReviewStatus,
} from "./db/schema";

/**
 * Reporting queries shared by the dashboard and the public reporting API.
 * Semantics follow docs/spec/reference-build-specification.md §1–2 and the
 * decisions in docs/decisions.md (DEC-010..DEC-013). Every query is scoped by
 * orgId, which callers must take from an authorized context — never from input.
 */

export const DATA_FRESHNESS_SECONDS = 300;

/** Filter IDs as received from clients; "0" is the sentinel for Unattributed (campaign) / Custom Posts (playbook). */
export interface IdFilter {
  ids: string[];
}

function idCondition(column: typeof posts.campaignId | typeof posts.playbookId, filter: string[] | undefined): SQL | undefined {
  if (!filter || filter.length === 0) return undefined;
  const includeNull = filter.includes("0");
  const ids = filter.filter((id) => id !== "0");
  const parts: SQL[] = [];
  if (ids.length) parts.push(inArray(column, ids));
  if (includeNull) parts.push(isNull(column));
  return parts.length === 1 ? parts[0] : or(...parts);
}

/* ----------------------------------------------------------------------------
 * Daily report
 * ------------------------------------------------------------------------- */

export const dailyMetricNames = ["views", "spend", "cpm", "posts", "creators", "estimated_installs", "installs_by_source"] as const;
export type DailyMetricName = (typeof dailyMetricNames)[number];

export interface DailyReportParams {
  range: DateRange;
  groupBy: Array<"campaign" | "playbook">;
  campaignIds?: string[];
  playbookIds?: string[];
  metrics?: DailyMetricName[];
}

export interface DailyRow {
  date: string;
  campaign_id?: string;
  campaign_name?: string;
  playbook_id?: string;
  playbook_name?: string;
  views?: number;
  spend?: number;
  cpm?: number | null;
  posts?: number;
  creators?: number;
  estimated_installs?: number;
  installs_by_source?: Record<string, number>;
}

export interface DailyReport {
  meta: {
    start_date: string;
    end_date: string;
    group_by: string[];
    timezone: "UTC";
    row_count: number;
    data_freshness_seconds: number;
  };
  totals: {
    views?: number;
    spend?: number;
    cpm?: number | null;
    posts?: number;
    creators?: number;
    estimated_installs?: number;
    installs_source?: "store" | "estimated" | "mixed" | null;
  };
  data: DailyRow[];
}

const centsToUsd = (cents: number) => Math.round(cents) / 100;

export async function dailyReport(orgId: string, params: DailyReportParams): Promise<DailyReport> {
  const db = await getDb();
  const metrics = new Set<DailyMetricName>(params.metrics?.length ? params.metrics : dailyMetricNames);
  const byCampaign = params.groupBy.includes("campaign");
  const byPlaybook = params.groupBy.includes("playbook");

  const where = and(
    eq(postDailyMetrics.orgId, orgId),
    eq(posts.orgId, orgId),
    between(postDailyMetrics.day, params.range.from, params.range.to),
    eq(posts.reviewStatus, "approved"),
    idCondition(posts.campaignId, params.campaignIds),
    idCondition(posts.playbookId, params.playbookIds),
  );

  const groupCols = [postDailyMetrics.day, ...(byCampaign ? [posts.campaignId] : []), ...(byPlaybook ? [posts.playbookId] : [])];
  const rows = await db
    .select({
      day: postDailyMetrics.day,
      campaignId: byCampaign ? posts.campaignId : sql<string | null>`null`,
      playbookId: byPlaybook ? posts.playbookId : sql<string | null>`null`,
      views: sql<number>`coalesce(sum(${postDailyMetrics.views}), 0)::bigint`.mapWith(Number),
      spendCents: sql<number>`coalesce(sum(${postDailyMetrics.spendCents}), 0)::bigint`.mapWith(Number),
      posts: sql<number>`count(distinct ${posts.id})`.mapWith(Number),
      creators: sql<number>`count(distinct ${posts.creatorId})`.mapWith(Number),
    })
    .from(postDailyMetrics)
    .innerJoin(posts, eq(posts.id, postDailyMetrics.postId))
    .where(where)
    .groupBy(...groupCols)
    .orderBy(asc(postDailyMetrics.day));

  const [totalsRow] = await db
    .select({
      views: sql<number>`coalesce(sum(${postDailyMetrics.views}), 0)::bigint`.mapWith(Number),
      spendCents: sql<number>`coalesce(sum(${postDailyMetrics.spendCents}), 0)::bigint`.mapWith(Number),
      posts: sql<number>`count(distinct ${posts.id})`.mapWith(Number),
      creators: sql<number>`count(distinct ${posts.creatorId})`.mapWith(Number),
    })
    .from(postDailyMetrics)
    .innerJoin(posts, eq(posts.id, postDailyMetrics.postId))
    .where(where);

  const names = await entityNames(orgId);
  const data: DailyRow[] = rows.map((r) => {
    const row: DailyRow = { date: r.day };
    if (byCampaign) {
      row.campaign_id = r.campaignId ?? "0";
      row.campaign_name = r.campaignId ? names.campaigns.get(r.campaignId) ?? "Unknown campaign" : "Unattributed";
    }
    if (byPlaybook) {
      row.playbook_id = r.playbookId ?? "0";
      row.playbook_name = r.playbookId ? names.playbooks.get(r.playbookId) ?? "Unknown playbook" : "Custom Posts";
    }
    if (metrics.has("views")) row.views = r.views;
    if (metrics.has("spend")) row.spend = centsToUsd(r.spendCents);
    if (metrics.has("cpm")) row.cpm = cpmUsd(r.spendCents, r.views);
    if (metrics.has("posts")) row.posts = r.posts;
    if (metrics.has("creators")) row.creators = r.creators;
    return row;
  });

  const totals: DailyReport["totals"] = {};
  if (metrics.has("views")) totals.views = totalsRow?.views ?? 0;
  if (metrics.has("spend")) totals.spend = centsToUsd(totalsRow?.spendCents ?? 0);
  if (metrics.has("cpm")) totals.cpm = cpmUsd(totalsRow?.spendCents ?? 0, totalsRow?.views ?? 0);
  if (metrics.has("posts")) totals.posts = totalsRow?.posts ?? 0;
  if (metrics.has("creators")) totals.creators = totalsRow?.creators ?? 0;

  // Installs are organization-wide and only exist at day grain (never attributed to campaigns/playbooks).
  const wantsInstalls = metrics.has("estimated_installs") || metrics.has("installs_by_source");
  if (wantsInstalls && !byCampaign && !byPlaybook) {
    const installs = await installsByDay(orgId, params.range);
    if (installs.size) {
      const byDate = new Map(data.map((d) => [d.date, d]));
      const sources = new Set<"store" | "estimated">();
      let totalInstalls = 0;
      for (const [day, perSource] of installs) {
        let row = byDate.get(day);
        if (!row) {
          row = { date: day };
          data.push(row);
          byDate.set(day, row);
        }
        const blended = blendInstalls(perSource);
        if (metrics.has("estimated_installs") && blended) {
          row.estimated_installs = blended.value;
          totalInstalls += blended.value;
          sources.add(blended.source);
        }
        if (metrics.has("installs_by_source")) row.installs_by_source = Object.fromEntries(perSource);
      }
      data.sort((a, b) => a.date.localeCompare(b.date));
      if (metrics.has("estimated_installs")) {
        totals.estimated_installs = totalInstalls;
        totals.installs_source = sources.size === 0 ? null : sources.size === 2 ? "mixed" : [...sources][0];
      }
    }
  }

  return {
    meta: {
      start_date: params.range.from,
      end_date: params.range.to,
      group_by: ["date", ...params.groupBy],
      timezone: "UTC",
      row_count: data.length,
      data_freshness_seconds: DATA_FRESHNESS_SECONDS,
    },
    totals,
    data,
  };
}

const sourceKey: Record<"app_store" | "play_store" | "estimate", string> = {
  app_store: "app_store",
  play_store: "play_store",
  estimate: "noise",
};

async function installsByDay(orgId: string, range: DateRange): Promise<Map<string, Map<string, number>>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(installObservations)
    .where(and(eq(installObservations.orgId, orgId), between(installObservations.day, range.from, range.to)));
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const day = out.get(r.day) ?? new Map<string, number>();
    // Raw series keyed by source. The estimate series is overall (never split by platform).
    day.set(sourceKey[r.source], r.installs);
    out.set(r.day, day);
  }
  return out;
}

/**
 * Blended daily installs (DEC-012): store actuals take precedence whenever any
 * store reported that day (App Store + Play Store are disjoint platforms, so
 * they add); otherwise the estimate. Raw series are never summed with estimates.
 */
export function blendInstalls(perSource: Map<string, number>): { value: number; source: "store" | "estimated" } | null {
  const apple = perSource.get("app_store");
  const google = perSource.get("play_store");
  if (apple !== undefined || google !== undefined) return { value: (apple ?? 0) + (google ?? 0), source: "store" };
  const estimate = perSource.get("noise");
  if (estimate !== undefined) return { value: estimate, source: "estimated" };
  return null;
}

/* ----------------------------------------------------------------------------
 * Post drilldown
 * ------------------------------------------------------------------------- */

export const postSorts = ["posted", "views", "range_views", "likes", "comments", "bookmarks", "shares", "spend", "engagement", "handle"] as const;
export type PostSort = (typeof postSorts)[number];

export interface PostQueryParams {
  range: DateRange;
  mode: "created" | "active";
  campaignIds?: string[];
  playbookIds?: string[];
  platforms?: Platform[];
  search?: string;
  reviewStatuses?: ReviewStatus[];
  page: number;
  pageSize: number;
  sort: PostSort;
  order: "asc" | "desc";
}

export interface PostRow {
  content_id: string;
  user_id: string;
  campaign_id: string;
  playbook_id: string;
  playbook_name: string | null;
  platform: Platform;
  handle: string;
  code: string | null;
  avatar_url: string | null;
  posted_at: string | null;
  range_views: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  bookmarks: number | null;
  shares: number | null;
  engagement_rate: number | null;
  spend: number;
  image: string | null;
  url: string;
  review_status: ReviewStatus;
}

export interface PostPage {
  meta: {
    page: number;
    page_size: number;
    total: number;
    returned: number;
    sort: PostSort;
    order: "asc" | "desc";
    timezone: "UTC";
    data_freshness_seconds: number;
  };
  data: PostRow[];
}

export const MAX_PAGE_SIZE = 100;

export async function queryPosts(orgId: string, params: PostQueryParams): Promise<PostPage> {
  const db = await getDb();
  const pageSize = Math.min(Math.max(1, params.pageSize), MAX_PAGE_SIZE);
  const page = Math.max(1, params.page);

  const inRange = db
    .select({
      postId: postDailyMetrics.postId,
      rangeViews: sql<number>`coalesce(sum(${postDailyMetrics.views}), 0)::bigint`.as("range_views"),
      rangeSpend: sql<number>`coalesce(sum(${postDailyMetrics.spendCents}), 0)::bigint`.as("range_spend"),
    })
    .from(postDailyMetrics)
    .where(and(eq(postDailyMetrics.orgId, orgId), between(postDailyMetrics.day, params.range.from, params.range.to)))
    .groupBy(postDailyMetrics.postId)
    .as("in_range");

  const postedOrSubmitted = sql`coalesce(${posts.postedAt}, ${posts.submittedAt})`;
  const rangeStart = new Date(`${params.range.from}T00:00:00.000Z`);
  const rangeEndExclusive = new Date(new Date(`${params.range.to}T00:00:00.000Z`).getTime() + 86_400_000);

  // Omitting the campaign filter includes all campaigns but excludes unattributed posts (documented behavior).
  const campaignCond = params.campaignIds?.length ? idCondition(posts.campaignId, params.campaignIds) : sql`${posts.campaignId} is not null`;
  const conditions: Array<SQL | undefined> = [
    eq(posts.orgId, orgId),
    inArray(posts.reviewStatus, params.reviewStatuses?.length ? params.reviewStatuses : ["approved"]),
    campaignCond,
    idCondition(posts.playbookId, params.playbookIds),
    params.platforms?.length ? inArray(posts.platform, params.platforms) : undefined,
    params.search ? or(ilike(posts.handle, `%${escapeLike(params.search)}%`), ilike(posts.caption, `%${escapeLike(params.search)}%`)) : undefined,
    params.mode === "created"
      ? and(sql`${postedOrSubmitted} >= ${rangeStart}`, sql`${postedOrSubmitted} < ${rangeEndExclusive}`)
      : gt(sql`coalesce(${inRange.rangeViews}, 0)`, 0),
  ];
  const where = and(...conditions);

  const engagementExpr = sql`(coalesce(${posts.likes},0) + coalesce(${posts.comments},0) + coalesce(${posts.bookmarks},0) + coalesce(${posts.shares},0))::float8 / nullif(${posts.views}, 0)`;
  const sortExpr: Record<PostSort, SQL> = {
    posted: sql`${postedOrSubmitted}`,
    views: sql`${posts.views}`,
    range_views: sql`coalesce(${inRange.rangeViews}, 0)`,
    likes: sql`${posts.likes}`,
    comments: sql`${posts.comments}`,
    bookmarks: sql`${posts.bookmarks}`,
    shares: sql`${posts.shares}`,
    spend: sql`coalesce(${inRange.rangeSpend}, 0)`,
    engagement: engagementExpr,
    handle: sql`lower(${posts.handle})`,
  };
  const orderFn = params.order === "asc" ? asc : desc;
  const primary = params.order === "asc" ? sql`${sortExpr[params.sort]} asc nulls last` : sql`${sortExpr[params.sort]} desc nulls last`;

  const [{ total }] = await db
    .select({ total: count() })
    .from(posts)
    .leftJoin(inRange, eq(inRange.postId, posts.id))
    .where(where);

  const rows = await db
    .select({
      post: posts,
      rangeViews: sql<number>`coalesce(${inRange.rangeViews}, 0)`.mapWith(Number),
      rangeSpend: sql<number>`coalesce(${inRange.rangeSpend}, 0)`.mapWith(Number),
      playbookName: playbooks.name,
    })
    .from(posts)
    .leftJoin(inRange, eq(inRange.postId, posts.id))
    .leftJoin(playbooks, and(eq(playbooks.id, posts.playbookId), eq(playbooks.orgId, orgId)))
    .where(where)
    .orderBy(primary, orderFn(posts.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data: PostRow[] = rows.map(({ post: p, rangeViews, rangeSpend, playbookName }) => ({
    content_id: p.id,
    user_id: p.creatorId,
    campaign_id: p.campaignId ?? "0",
    playbook_id: p.playbookId ?? "0",
    playbook_name: p.playbookId ? playbookName : null,
    platform: p.platform,
    handle: p.handle,
    code: p.externalId,
    avatar_url: null,
    posted_at: (p.postedAt ?? p.submittedAt)?.toISOString() ?? null,
    range_views: rangeViews,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    bookmarks: p.bookmarks,
    shares: p.shares,
    engagement_rate: engagementRate(p),
    spend: centsToUsd(rangeSpend),
    image: p.thumbnailUrl,
    url: p.url,
    review_status: p.reviewStatus,
  }));

  return {
    meta: {
      page,
      page_size: pageSize,
      total,
      returned: data.length,
      sort: params.sort,
      order: params.order,
      timezone: "UTC",
      data_freshness_seconds: DATA_FRESHNESS_SECONDS,
    },
    data,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* ----------------------------------------------------------------------------
 * Filter choices and names
 * ------------------------------------------------------------------------- */

export async function listCampaignChoices(orgId: string): Promise<Array<{ id: string; name: string; active: boolean }>> {
  const db = await getDb();
  const rows = await db
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .orderBy(asc(campaigns.name));
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.status === "active" }));
}

export async function listPlaybookChoices(orgId: string): Promise<Array<{ id: string; name: string; active: boolean; campaign_id: string }>> {
  const db = await getDb();
  const rows = await db
    .select({ id: playbooks.id, name: playbooks.name, active: playbooks.active, status: playbooks.status, campaignId: playbooks.campaignId })
    .from(playbooks)
    .where(eq(playbooks.orgId, orgId))
    .orderBy(asc(playbooks.name));
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.status === "published" && r.active, campaign_id: r.campaignId }));
}

async function entityNames(orgId: string) {
  const db = await getDb();
  const [c, p] = await Promise.all([
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.orgId, orgId)),
    db.select({ id: playbooks.id, name: playbooks.name }).from(playbooks).where(eq(playbooks.orgId, orgId)),
  ]);
  return { campaigns: new Map(c.map((r) => [r.id, r.name])), playbooks: new Map(p.map((r) => [r.id, r.name])) };
}

/* ----------------------------------------------------------------------------
 * Rolling views (Home / Live counters)
 * ------------------------------------------------------------------------- */

export type Availability<T> = { status: "available"; value: T; observedThrough: Date | null } | { status: "unavailable"; reason: string };

/**
 * Views gained in the trailing window, from cumulative observations. A
 * workspace with no posts at all is a confirmed zero; posts without any
 * metric source are "unavailable" (never a fabricated zero).
 */
export async function rollingViews(orgId: string, windowMinutes: number, now: Date = new Date()): Promise<Availability<number>> {
  const db = await getDb();
  const [{ postCount }] = await db.select({ postCount: count() }).from(posts).where(and(eq(posts.orgId, orgId), eq(posts.reviewStatus, "approved")));
  if (postCount === 0) return { status: "available", value: 0, observedThrough: null };

  const windowStart = new Date(now.getTime() - windowMinutes * 60_000);
  const [latestObs] = await db
    .select({ at: sql<Date | null>`max(${metricObservations.observedAt})` })
    .from(metricObservations)
    .where(eq(metricObservations.orgId, orgId));
  if (!latestObs?.at) return { status: "unavailable", reason: "No metrics source has reported views for your posts yet." };

  const rows = await executeRows<{ gained: string | number | null }>(db, sql`
    with touched as (
      select distinct post_id from ${metricObservations}
      where org_id = ${orgId} and observed_at > ${windowStart} and observed_at <= ${now}
    ), per_post as (
      select
        (select o.views from ${metricObservations} o where o.post_id = t.post_id and o.observed_at <= ${now}
           order by o.observed_at desc limit 1) as latest,
        (select o.views from ${metricObservations} o where o.post_id = t.post_id and o.observed_at <= ${windowStart}
           order by o.observed_at desc limit 1) as baseline,
        (select o.views from ${metricObservations} o where o.post_id = t.post_id and o.observed_at > ${windowStart} and o.observed_at <= ${now}
           order by o.observed_at asc limit 1) as first_in_window
      from touched t
    )
    select coalesce(sum(greatest(0, latest - coalesce(baseline, first_in_window))), 0) as gained from per_post
  `);
  const latestAt = latestObs.at instanceof Date ? latestObs.at : new Date(latestObs.at as unknown as string);
  return { status: "available", value: Number(rows[0]?.gained ?? 0), observedThrough: latestAt };
}
