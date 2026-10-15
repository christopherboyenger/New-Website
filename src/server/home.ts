import "server-only";
import { and, between, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { eachDay, type DateRange } from "@/domain/date-range";
import { getDb } from "./db/client";
import {
  campaigns,
  integrationInstallations,
  postDailyMetrics,
  posts,
  userFlags,
  type IntegrationStatus,
} from "./db/schema";
import { rememberLastOrg } from "./organizations";
import { dailyReport, queryPosts, rollingViews, type Availability, type PostRow } from "./reporting";

/**
 * Data loaders for the workspace shell, Home (L01) and Live (L09). Every
 * function takes the orgId from an authorized context (requireOrgPage /
 * requireOrgAction); none of them accept client input as a tenant key.
 */

/* ----------------------------------------------------------------------------
 * Shell
 * ------------------------------------------------------------------------- */

export type MessagesDockState = (typeof userFlags.$inferSelect)["messagesDockState"];

export interface ShellState {
  sidebarCollapsed: boolean;
  messagesDockState: MessagesDockState;
}

/**
 * Reads the user's shell preferences and records `orgId` as the last opened
 * workspace (used by `/home` to redirect). The write only happens when the
 * workspace actually changed, so ordinary navigation does not write.
 */
export async function loadShellState(userId: string, orgId: string): Promise<ShellState> {
  const db = await getDb();
  const [flags] = await db
    .select({ lastOrgId: userFlags.lastOrgId, sidebarCollapsed: userFlags.sidebarCollapsed, messagesDockState: userFlags.messagesDockState })
    .from(userFlags)
    .where(eq(userFlags.userId, userId))
    .limit(1);
  if (flags?.lastOrgId !== orgId) await rememberLastOrg(userId, orgId);
  return {
    sidebarCollapsed: flags?.sidebarCollapsed ?? false,
    messagesDockState: flags?.messagesDockState ?? "minimized",
  };
}

/* ----------------------------------------------------------------------------
 * Rolling counters (Home + Live)
 * ------------------------------------------------------------------------- */

export interface RollingCounters {
  last24h: Availability<number>;
  last60m: Availability<number>;
  /** The instant the counters were computed for (freshness is shown relative to it). */
  generatedAt: Date;
}

/** Views gained in the trailing 24 hours and 60 minutes (DEC-013: unavailable is never shown as 0). */
export async function loadRollingCounters(orgId: string, now: Date = new Date()): Promise<RollingCounters> {
  const [last24h, last60m] = await Promise.all([rollingViews(orgId, 24 * 60, now), rollingViews(orgId, 60, now)]);
  return { last24h, last60m, generatedAt: now };
}

/* ----------------------------------------------------------------------------
 * Home: "Your metrics"
 * ------------------------------------------------------------------------- */

export interface OrganicSummary {
  totalViews: number;
  /** One point per UTC day in the range; days without metric rows are confirmed zero days. */
  series: Array<{ day: string; views: number }>;
}

export async function loadOrganicSummary(orgId: string, range: DateRange): Promise<OrganicSummary> {
  const report = await dailyReport(orgId, { range, groupBy: [], metrics: ["views"] });
  const byDay = new Map(report.data.map((row) => [row.date, row.views ?? 0]));
  return {
    totalViews: report.totals.views ?? 0,
    series: eachDay(range).map((day) => ({ day, views: byDay.get(day) ?? 0 })),
  };
}

export type AdProvider = "meta_ads" | "tiktok_ads";

export const adProviderLabels: Record<AdProvider, string> = { meta_ads: "Meta Ads", tiktok_ads: "TikTok Ads" };

/**
 * Ad impressions card state. No ad reporting pipeline exists yet, so even a
 * connected account never yields a number here — only an honest explanation.
 */
export type AdReportingState =
  | { status: "not_connected" }
  | { status: "needs_attention"; providers: AdProvider[] }
  | { status: "reporting_unavailable"; providers: AdProvider[] };

const usableStatuses: ReadonlySet<IntegrationStatus> = new Set(["connected", "limited_permissions"]);
const attentionStatuses: ReadonlySet<IntegrationStatus> = new Set(["reauthorization_required", "error", "revocation_pending"]);

export async function loadAdReportingState(orgId: string): Promise<AdReportingState> {
  const db = await getDb();
  const rows = await db
    .select({ provider: integrationInstallations.provider, status: integrationInstallations.status })
    .from(integrationInstallations)
    .where(and(eq(integrationInstallations.orgId, orgId), inArray(integrationInstallations.provider, ["meta_ads", "tiktok_ads"])));
  const connected = rows.filter((r) => usableStatuses.has(r.status)).map((r) => r.provider as AdProvider);
  if (connected.length) return { status: "reporting_unavailable", providers: connected.sort() };
  const attention = rows.filter((r) => attentionStatuses.has(r.status)).map((r) => r.provider as AdProvider);
  if (attention.length) return { status: "needs_attention", providers: attention.sort() };
  return { status: "not_connected" };
}

export interface ActiveCampaignSummary {
  id: string;
  name: string;
  spendCents: number;
  views: number;
}

/** Active campaigns that earned (had spend on approved posts) in the range, highest spend first. */
export async function loadActiveCampaigns(orgId: string, range: DateRange, limit = 5): Promise<ActiveCampaignSummary[]> {
  const db = await getDb();
  const spend = sql<number>`coalesce(sum(${postDailyMetrics.spendCents}), 0)::bigint`;
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      spendCents: spend.mapWith(Number),
      views: sql<number>`coalesce(sum(${postDailyMetrics.views}), 0)::bigint`.mapWith(Number),
    })
    .from(postDailyMetrics)
    .innerJoin(posts, and(eq(posts.id, postDailyMetrics.postId), eq(posts.orgId, orgId)))
    .innerJoin(campaigns, and(eq(campaigns.id, posts.campaignId), eq(campaigns.orgId, orgId)))
    .where(
      and(
        eq(postDailyMetrics.orgId, orgId),
        between(postDailyMetrics.day, range.from, range.to),
        eq(posts.reviewStatus, "approved"),
        eq(campaigns.status, "active"),
      ),
    )
    .groupBy(campaigns.id, campaigns.name)
    .having(sql`${spend} > 0`)
    .orderBy(desc(spend), campaigns.name)
    .limit(limit);
  return rows;
}

export interface RecentPosts {
  /** Approved, campaign-attributed posts created in the range (Organic "Created in range"). */
  totalInRange: number;
  /** Whether the workspace has any approved, campaign-attributed post at all (distinguishes the two empty states). */
  workspaceHasPosts: boolean;
  items: PostRow[];
}

export async function loadRecentPosts(orgId: string, range: DateRange, limit = 5): Promise<RecentPosts> {
  const page = await queryPosts(orgId, { range, mode: "created", page: 1, pageSize: limit, sort: "posted", order: "desc" });
  let workspaceHasPosts = page.meta.total > 0;
  if (!workspaceHasPosts) {
    const db = await getDb();
    const [{ n }] = await db
      .select({ n: count() })
      .from(posts)
      .where(and(eq(posts.orgId, orgId), eq(posts.reviewStatus, "approved"), isNotNull(posts.campaignId)));
    workspaceHasPosts = n > 0;
  }
  return { totalInRange: page.meta.total, workspaceHasPosts, items: page.data };
}

export async function countCampaigns(orgId: string): Promise<number> {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(campaigns).where(eq(campaigns.orgId, orgId));
  return n;
}

export interface HomeMetrics {
  organic: OrganicSummary;
  ads: AdReportingState;
  activeCampaigns: ActiveCampaignSummary[];
  /** Total campaigns in the workspace (any status), to choose between "create one" and "none earning" guidance. */
  campaignCount: number;
  posts: RecentPosts;
}

export async function loadHomeMetrics(orgId: string, range: DateRange): Promise<HomeMetrics> {
  const [organic, ads, activeCampaigns, campaignCount, recent] = await Promise.all([
    loadOrganicSummary(orgId, range),
    loadAdReportingState(orgId),
    loadActiveCampaigns(orgId, range),
    countCampaigns(orgId),
    loadRecentPosts(orgId, range),
  ]);
  return { organic, ads, activeCampaigns, campaignCount, posts: recent };
}
