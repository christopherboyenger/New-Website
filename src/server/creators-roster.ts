import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { creatorLevels, platforms, type CreatorLevel, type Platform } from "@/domain/campaign";
import { fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { NotFoundError, requireOrgAction, type OrgContext } from "./authz";
import { executeRows, getDb, type DbLike } from "./db/client";
import { campaignMemberships, campaigns, creators, orgCreators, posts, socialAccounts } from "./db/schema";
import { likePattern, type Paged } from "./members";

/**
 * Creators roster (L10). The roster of an organization is every creator
 * linked to it by
 *   - an `org_creators` row (its All / Removed state lives there), or
 *   - an approved admission to one of its campaigns, or
 *   - an approved post in it.
 * Creators reachable only through the last two have no org_creators row yet
 * and count as active; removing one inserts the row.
 *
 * All queries take the orgId from an authorized context; creator IDs from the
 * client only select within that roster. Table metrics are LIFETIME counters
 * of the creator's approved posts in this org (never other orgs'); a sum with
 * no observed post is null ("—"), never 0.
 */

export const ROSTER_PAGE_SIZE = 25;
/** Summary cards (Most Views / Most Viral / Most Engaging) look at the last 30 UTC days. */
export const SUMMARY_WINDOW_DAYS = 30;
/** Most Engaging needs at least this many views in the window, so tiny samples don't win. */
export const ENGAGING_MIN_VIEWS = 1000;
/** Posting activity heatmap length. */
export const ACTIVITY_WEEKS = 8;

export const rosterTabs = ["all", "removed"] as const;
export type RosterTab = (typeof rosterTabs)[number];
export const rosterSorts = ["creator", "level", "posts", "views", "likes", "comments", "platforms", "accounts"] as const;
export type RosterSort = (typeof rosterSorts)[number];
export type SortOrder = "asc" | "desc";

export interface RosterQuery {
  tab: RosterTab;
  q: string;
  campaign: string | null;
  level: CreatorLevel | null;
  platform: Platform | null;
  sort: RosterSort;
  order: SortOrder;
  page: number;
  /** Creator whose detail drawer is open. */
  creator: string | null;
}

export const defaultRosterQuery: RosterQuery = { tab: "all", q: "", campaign: null, level: null, platform: null, sort: "views", order: "desc", page: 1, creator: null };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Lenient URL parsing: malformed values fall back to defaults. `search` is accepted as an alias of `q`. */
export function parseRosterQuery(params: Params): RosterQuery {
  const tab = first(params.tab);
  const sort = first(params.sort);
  const order = first(params.order);
  const level = first(params.level);
  const platform = first(params.platform);
  const page = Number.parseInt(first(params.page), 10);
  const campaign = first(params.campaign).trim();
  const creator = first(params.creator).trim();
  const q = (first(params.q) || first(params.search)).trim().slice(0, 100);
  const parsedSort: RosterSort = (rosterSorts as readonly string[]).includes(sort) ? (sort as RosterSort) : "views";
  return {
    tab: (rosterTabs as readonly string[]).includes(tab) ? (tab as RosterTab) : "all",
    q,
    campaign: campaign && campaign.length <= 100 ? campaign : null,
    level: (creatorLevels as readonly string[]).includes(level) ? (level as CreatorLevel) : null,
    platform: (platforms as readonly string[]).includes(platform) ? (platform as Platform) : null,
    sort: parsedSort,
    order: order === "asc" || order === "desc" ? order : parsedSort === "creator" ? "asc" : "desc",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    creator: creator && creator.length <= 100 ? creator : null,
  };
}

/** Canonical query string (defaults omitted). */
export function rosterQueryString(query: RosterQuery, patch: Partial<RosterQuery> = {}): string {
  const q = { ...query, ...patch };
  const params = new URLSearchParams();
  if (q.tab !== "all") params.set("tab", q.tab);
  if (q.q) params.set("q", q.q);
  if (q.campaign) params.set("campaign", q.campaign);
  if (q.level) params.set("level", q.level);
  if (q.platform) params.set("platform", q.platform);
  if (q.sort !== "views" || q.order !== "desc") {
    params.set("sort", q.sort);
    params.set("order", q.order);
  }
  if (q.page > 1) params.set("page", String(q.page));
  if (q.creator) params.set("creator", q.creator);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/* ----------------------------------------------------------------------------
 * Roster set
 * ------------------------------------------------------------------------- */

/** CTE body: one row per roster creator with its removed state and first-seen time. */
function rosterCte(orgId: string): SQL {
  return sql`
    select oc.creator_id, oc.removed_at, oc.first_seen_at
      from org_creators oc where oc.org_id = ${orgId}
    union all
    select linked.creator_id, null::timestamptz as removed_at, min(linked.seen_at) as first_seen_at
      from (
        select cm.creator_id, coalesce(cm.decided_at, cm.requested_at) as seen_at
          from campaign_memberships cm where cm.org_id = ${orgId} and cm.status = 'approved'
        union all
        select p.creator_id, p.submitted_at as seen_at
          from posts p where p.org_id = ${orgId} and p.review_status = 'approved'
      ) linked
     where not exists (select 1 from org_creators oc2 where oc2.org_id = ${orgId} and oc2.creator_id = linked.creator_id)
     group by linked.creator_id`;
}

/** Whether a creator is on the org's roster, and whether they were removed. */
export async function rosterMembership(db: DbLike, orgId: string, creatorId: string): Promise<{ removed: boolean; firstSeenAt: Date } | null> {
  const rows = await executeRows<{ removed_at: string | Date | null; first_seen_at: string | Date }>(
    db,
    sql`with roster as (${rosterCte(orgId)}) select removed_at, first_seen_at from roster where creator_id = ${creatorId} limit 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return { removed: row.removed_at !== null, firstSeenAt: new Date(row.first_seen_at) };
}

/**
 * Whether the org removed this creator. Removed creators must not be admitted
 * to the org's campaigns again until restored (used by campaign admission).
 */
export async function isCreatorRemovedFromOrg(orgId: string, creatorId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ removedAt: orgCreators.removedAt })
    .from(orgCreators)
    .where(and(eq(orgCreators.orgId, orgId), eq(orgCreators.creatorId, creatorId)))
    .limit(1);
  return Boolean(row?.removedAt);
}

/* ----------------------------------------------------------------------------
 * Table
 * ------------------------------------------------------------------------- */

export interface RosterRow {
  id: string;
  name: string;
  level: CreatorLevel;
  removed: boolean;
  posts: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  platforms: Platform[];
  accounts: number;
  /** UTC day (YYYY-MM-DD) → approved posts that day, within the activity window. */
  activity: Record<string, number>;
}

export interface RosterTable extends Paged<RosterRow> {
  /** Last UTC day of the activity window (today). */
  activityEnd: string;
}

const sortExpressions: Record<RosterSort, SQL> = {
  creator: sql`lower(c.display_name)`,
  level: sql`array_position(array['bronze','silver','gold','platinum','diamond']::text[], c.level::text)`,
  posts: sql`coalesce(s.posts, 0)`,
  views: sql`s.views`,
  likes: sql`s.likes`,
  comments: sql`s.comments`,
  platforms: sql`coalesce(a.platform_count, 0)`,
  accounts: sql`coalesce(a.accounts, 0)`,
};

function filterConditions(orgId: string, query: RosterQuery): SQL {
  const parts: SQL[] = [query.tab === "removed" ? sql`r.removed_at is not null` : sql`r.removed_at is null`];
  if (query.q) {
    const pattern = likePattern(query.q.replace(/^@/, ""));
    parts.push(sql`(c.display_name ilike ${pattern} or exists (select 1 from social_accounts sa where sa.creator_id = c.id and sa.handle ilike ${pattern}))`);
  }
  if (query.level) parts.push(sql`c.level = ${query.level}`);
  if (query.platform) parts.push(sql`exists (select 1 from social_accounts sa where sa.creator_id = c.id and sa.platform = ${query.platform})`);
  if (query.campaign) {
    parts.push(sql`(
      exists (select 1 from campaign_memberships cm where cm.org_id = ${orgId} and cm.campaign_id = ${query.campaign} and cm.creator_id = c.id and cm.status = 'approved')
      or exists (select 1 from posts p where p.org_id = ${orgId} and p.campaign_id = ${query.campaign} and p.creator_id = c.id)
    )`);
  }
  return sql.join(parts, sql` and `);
}

type RosterSqlRow = {
  id: string;
  display_name: string;
  level: CreatorLevel;
  removed_at: unknown;
  posts: number | string | null;
  views: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  platform_list: string | null;
  accounts: number | string | null;
  total: number | string;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function listRoster(ctx: OrgContext, query: RosterQuery, now = new Date()): Promise<RosterTable> {
  const db = await getDb();
  const orgId = ctx.org.id;
  const where = filterConditions(orgId, query);
  const direction = query.order === "asc" ? sql`asc` : sql`desc`;
  const run = (page: number) =>
    executeRows<RosterSqlRow>(
      db,
      sql`
      with roster as (${rosterCte(orgId)}),
      s as (
        select p.creator_id, count(*) as posts, sum(p.views) as views, sum(p.likes) as likes, sum(p.comments) as comments
          from posts p where p.org_id = ${orgId} and p.review_status = 'approved'
         group by p.creator_id
      ),
      a as (
        select sa.creator_id, count(*) as accounts, count(distinct sa.platform) as platform_count, string_agg(distinct sa.platform::text, ',') as platform_list
          from social_accounts sa where sa.creator_id in (select creator_id from roster)
         group by sa.creator_id
      )
      select c.id, c.display_name, c.level, r.removed_at, coalesce(s.posts, 0) as posts, s.views, s.likes, s.comments,
             a.platform_list, coalesce(a.accounts, 0) as accounts, count(*) over () as total
        from roster r
        join creators c on c.id = r.creator_id
        left join s on s.creator_id = c.id
        left join a on a.creator_id = c.id
       where ${where}
       order by ${sortExpressions[query.sort]} ${direction} nulls last, lower(c.display_name) asc, c.id asc
       limit ${ROSTER_PAGE_SIZE} offset ${(page - 1) * ROSTER_PAGE_SIZE}`,
    );

  let page = query.page;
  let rows = await run(page);
  let total = rows.length ? Number(rows[0].total) : 0;
  if (rows.length === 0 && page > 1) {
    // Page beyond the end (e.g. after removals): show the last page instead of an empty one.
    const [{ count: all }] = await executeRows<{ count: number | string }>(
      db,
      sql`with roster as (${rosterCte(orgId)}) select count(*) as count from roster r join creators c on c.id = r.creator_id where ${where}`,
    );
    total = Number(all);
    page = Math.max(1, Math.ceil(total / ROSTER_PAGE_SIZE));
    rows = total ? await run(page) : [];
  }

  const activityEnd = utcDay(now);
  const activity = await activityFor(db, orgId, rows.map((r) => r.id), now);
  return {
    total,
    page,
    pageSize: ROSTER_PAGE_SIZE,
    activityEnd,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.display_name,
      level: r.level,
      removed: r.removed_at !== null,
      posts: Number(r.posts ?? 0),
      views: num(r.views),
      likes: num(r.likes),
      comments: num(r.comments),
      platforms: platforms.filter((p) => (r.platform_list ?? "").split(",").includes(p)),
      accounts: Number(r.accounts ?? 0),
      activity: activity.get(r.id) ?? {},
    })),
  };
}

/** Approved posts per creator per UTC day over the activity window (posted time, or submission time when unknown). */
async function activityFor(db: DbLike, orgId: string, creatorIds: string[], now: Date): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (creatorIds.length === 0) return out;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (ACTIVITY_WEEKS * 7 - 1)));
  const at = sql`coalesce(${posts.postedAt}, ${posts.submittedAt})`;
  const day = sql<string>`to_char((${at}) at time zone 'UTC', 'YYYY-MM-DD')`;
  const rows = await db
    .select({ creatorId: posts.creatorId, day, n: sql<number>`count(*)` })
    .from(posts)
    .where(and(eq(posts.orgId, orgId), eq(posts.reviewStatus, "approved"), inArray(posts.creatorId, creatorIds), gte(at, start), sql`${at} <= ${now}`))
    .groupBy(posts.creatorId, day);
  for (const row of rows) {
    const map = out.get(row.creatorId) ?? {};
    map[row.day] = Number(row.n);
    out.set(row.creatorId, map);
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * Tabs, filters and summary cards
 * ------------------------------------------------------------------------- */

export async function rosterCounts(ctx: OrgContext): Promise<{ all: number; removed: number }> {
  const db = await getDb();
  const [row] = await executeRows<{ active_count: number | string; removed_count: number | string }>(
    db,
    sql`with roster as (${rosterCte(ctx.org.id)})
        select count(*) filter (where removed_at is null) as active_count, count(*) filter (where removed_at is not null) as removed_count from roster`,
  );
  return { all: Number(row?.active_count ?? 0), removed: Number(row?.removed_count ?? 0) };
}

export async function rosterCampaignOptions(ctx: OrgContext): Promise<Array<{ id: string; name: string }>> {
  const db = await getDb();
  return db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.orgId, ctx.org.id)).orderBy(asc(campaigns.name));
}

export interface SummaryLeader {
  creatorId: string;
  name: string;
  value: number;
}

export interface RosterSummary {
  windowDays: number;
  mostViews: SummaryLeader | null;
  mostViral: SummaryLeader | null;
  /** value = engagement rate in percent. */
  mostEngaging: SummaryLeader | null;
}

/**
 * Summary definitions (active roster creators, approved posts in this org):
 * - Most Views: most views EARNED in the last 30 UTC days (post_daily_metrics).
 * - Most Viral: the single post with the most lifetime views among posts
 *   published in the last 30 UTC days.
 * - Most Engaging: highest (likes + comments) ÷ views over posts published in
 *   the last 30 UTC days with observed counters, at least 1,000 views.
 * Each card is null ("No data yet") when nothing qualifies.
 */
export async function rosterSummary(ctx: OrgContext, now = new Date()): Promise<RosterSummary> {
  const db = await getDb();
  const orgId = ctx.org.id;
  const startDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (SUMMARY_WINDOW_DAYS - 1)));
  const start = utcDay(startDay);
  const end = utcDay(now);
  const active = sql`r.removed_at is null`;

  const [views] = await executeRows<{ id: string; name: string; value: number | string }>(
    db,
    sql`with roster as (${rosterCte(orgId)})
        select c.id, c.display_name as name, sum(d.views) as value
          from post_daily_metrics d
          join posts p on p.id = d.post_id and p.org_id = ${orgId} and p.review_status = 'approved'
          join roster r on r.creator_id = p.creator_id
          join creators c on c.id = p.creator_id
         where d.org_id = ${orgId} and d.day between ${start} and ${end} and ${active}
         group by c.id, c.display_name
        having sum(d.views) > 0
         order by value desc, lower(c.display_name) asc
         limit 1`,
  );

  const published = sql`coalesce(p.posted_at, p.submitted_at) >= ${startDay} and coalesce(p.posted_at, p.submitted_at) <= ${now}`;
  const [viral] = await executeRows<{ id: string; name: string; value: number | string }>(
    db,
    sql`with roster as (${rosterCte(orgId)})
        select c.id, c.display_name as name, p.views as value
          from posts p
          join roster r on r.creator_id = p.creator_id
          join creators c on c.id = p.creator_id
         where p.org_id = ${orgId} and p.review_status = 'approved' and p.views is not null and p.views > 0 and ${published} and ${active}
         order by p.views desc, lower(c.display_name) asc
         limit 1`,
  );

  const [engaging] = await executeRows<{ id: string; name: string; value: number | string }>(
    db,
    sql`with roster as (${rosterCte(orgId)})
        select c.id, c.display_name as name,
               (sum(coalesce(p.likes, 0) + coalesce(p.comments, 0))::float8 / sum(p.views)::float8) * 100 as value
          from posts p
          join roster r on r.creator_id = p.creator_id
          join creators c on c.id = p.creator_id
         where p.org_id = ${orgId} and p.review_status = 'approved' and p.views is not null and p.views > 0
           and (p.likes is not null or p.comments is not null) and ${published} and ${active}
         group by c.id, c.display_name
        having sum(p.views) >= ${ENGAGING_MIN_VIEWS}
         order by value desc, lower(c.display_name) asc
         limit 1`,
  );

  const leader = (row: { id: string; name: string; value: number | string } | undefined) => (row ? { creatorId: row.id, name: row.name, value: Number(row.value) } : null);
  return { windowDays: SUMMARY_WINDOW_DAYS, mostViews: leader(views), mostViral: leader(viral), mostEngaging: leader(engaging) };
}

/* ----------------------------------------------------------------------------
 * Detail drawer
 * ------------------------------------------------------------------------- */

export interface CreatorDetail {
  id: string;
  name: string;
  level: CreatorLevel;
  country: string | null;
  removed: boolean;
  firstSeenAt: string;
  accounts: Array<{ id: string; platform: Platform; handle: string; verification: "unverified" | "pending" | "verified" | "failed"; verifiedAt: string | null }>;
  campaigns: Array<{ id: string; name: string }>;
  recentPosts: Array<{
    id: string;
    platform: Platform;
    handle: string;
    url: string;
    postedAt: string | null;
    submittedAt: string;
    reviewStatus: "submitted" | "approved" | "rejected";
    views: number | null;
  }>;
}

export const DETAIL_RECENT_POSTS = 10;

/** Detail of a roster creator; NotFound for anyone outside the authorized org's roster. */
export async function loadCreatorDetail(ctx: OrgContext, creatorId: string): Promise<CreatorDetail | null> {
  const db = await getDb();
  const orgId = ctx.org.id;
  const membership = await rosterMembership(db, orgId, creatorId);
  if (!membership) return null;
  const [creator] = await db
    .select({ id: creators.id, name: creators.displayName, level: creators.level, country: creators.country })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);
  if (!creator) return null;

  const [accounts, campaignRows, recent] = await Promise.all([
    db
      .select({ id: socialAccounts.id, platform: socialAccounts.platform, handle: socialAccounts.handle, verification: socialAccounts.verification, verifiedAt: socialAccounts.verifiedAt })
      .from(socialAccounts)
      .where(eq(socialAccounts.creatorId, creatorId))
      .orderBy(asc(socialAccounts.platform), asc(socialAccounts.handle)),
    db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaignMemberships)
      .innerJoin(campaigns, and(eq(campaigns.id, campaignMemberships.campaignId), eq(campaigns.orgId, orgId)))
      .where(and(eq(campaignMemberships.orgId, orgId), eq(campaignMemberships.creatorId, creatorId), eq(campaignMemberships.status, "approved")))
      .orderBy(asc(campaigns.name)),
    db
      .select({
        id: posts.id,
        platform: posts.platform,
        handle: posts.handle,
        url: posts.url,
        postedAt: posts.postedAt,
        submittedAt: posts.submittedAt,
        reviewStatus: posts.reviewStatus,
        views: posts.views,
      })
      .from(posts)
      .where(and(eq(posts.orgId, orgId), eq(posts.creatorId, creatorId)))
      .orderBy(desc(sql`coalesce(${posts.postedAt}, ${posts.submittedAt})`), desc(posts.id))
      .limit(DETAIL_RECENT_POSTS),
  ]);

  return {
    ...creator,
    removed: membership.removed,
    firstSeenAt: membership.firstSeenAt.toISOString(),
    accounts: accounts.map((a) => ({ ...a, verifiedAt: a.verifiedAt?.toISOString() ?? null })),
    campaigns: campaignRows,
    recentPosts: recent.map((p) => ({ ...p, postedAt: p.postedAt?.toISOString() ?? null, submittedAt: p.submittedAt.toISOString(), views: p.views })),
  };
}

/* ----------------------------------------------------------------------------
 * Remove / restore
 * ------------------------------------------------------------------------- */

const selectionSchema = z.object({
  creatorIds: z.array(z.string().trim().min(1).max(100)).min(1, "Select at least one creator.").max(ROSTER_PAGE_SIZE * 4, "Select fewer creators at a time."),
});

async function assertOnRoster(db: DbLike, orgId: string, creatorIds: string[]): Promise<void> {
  const rows = await executeRows<{ creator_id: string }>(
    db,
    sql`with roster as (${rosterCte(orgId)}) select creator_id from roster where creator_id in (${sql.join(
      creatorIds.map((id) => sql`${id}`),
      sql`, `,
    )})`,
  );
  if (new Set(rows.map((r) => r.creator_id)).size !== creatorIds.length) throw new NotFoundError("One or more creators were not found.");
}

/**
 * Moves creators to the Removed tab. Their past posts and metrics stay in
 * reporting; existing campaign admissions are not changed; they cannot be
 * admitted to this org's campaigns again until restored.
 */
export async function removeCreators(slug: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "creator:manage");
    const parsed = selectionSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const ids = [...new Set(parsed.data.creatorIds)];
    const db = await getDb();
    const now = new Date();
    await db.transaction(async (tx) => {
      await assertOnRoster(tx, ctx.org.id, ids);
      for (const creatorId of ids) {
        await tx
          .insert(orgCreators)
          .values({ orgId: ctx.org.id, creatorId, firstSeenAt: now, removedAt: now, removedByUserId: ctx.user.id })
          .onConflictDoUpdate({
            target: [orgCreators.orgId, orgCreators.creatorId],
            set: { removedAt: now, removedByUserId: ctx.user.id },
            setWhere: sql`${orgCreators.removedAt} is null`,
          });
      }
      await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "creator.remove", targetType: "creator", data: { creatorIds: ids } }, tx);
    });
    return ok({ count: ids.length }, ids.length === 1 ? "Creator removed." : `${ids.length} creators removed.`);
  });
}

export async function restoreCreators(slug: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "creator:manage");
    const parsed = selectionSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const ids = [...new Set(parsed.data.creatorIds)];
    const db = await getDb();
    const restored = await db.transaction(async (tx) => {
      const rows = await tx
        .update(orgCreators)
        .set({ removedAt: null, removedByUserId: null })
        .where(and(eq(orgCreators.orgId, ctx.org.id), inArray(orgCreators.creatorId, ids), isNotNull(orgCreators.removedAt)))
        .returning({ creatorId: orgCreators.creatorId });
      if (rows.length !== ids.length) {
        const known = await tx
          .select({ creatorId: orgCreators.creatorId })
          .from(orgCreators)
          .where(and(eq(orgCreators.orgId, ctx.org.id), inArray(orgCreators.creatorId, ids)));
        if (known.length !== ids.length) throw new NotFoundError("One or more creators were not found.");
      }
      await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "creator.restore", targetType: "creator", data: { creatorIds: ids } }, tx);
      return rows.length;
    });
    if (restored === 0) return fail("Those creators are already on your roster.", "conflict");
    return ok({ count: restored }, restored === 1 ? "Creator restored." : `${restored} creators restored.`);
  });
}
