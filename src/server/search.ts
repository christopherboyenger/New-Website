"use server";

/**
 * Global search (L24): campaigns, playbooks, posts, creators and workspace
 * pages for the authorized organization only. The org comes from the
 * membership check, never from the query; pages are filtered by the caller's
 * permissions so Members never see owner-only destinations (e.g. Billing).
 */
import "server-only";
import { and, asc, eq, exists, ilike, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";
import { campaignStatusLabels, platformLabels } from "@/domain/campaign";
import type { Permission } from "@/domain/permissions";
import { fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { hasPermission, requireOrgAction } from "./authz";
import { getDb } from "./db/client";
import { campaignMemberships, campaigns, creators, orgCreators, playbooks, posts, socialAccounts } from "./db/schema";

export type SearchResultKind = "page" | "campaign" | "playbook" | "post" | "creator";

export interface SearchResultItem {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string | null;
  href: string;
}

export interface SearchResultGroup {
  kind: SearchResultKind;
  label: string;
  items: SearchResultItem[];
}

export interface SearchResults {
  query: string;
  groups: SearchResultGroup[];
}

const MAX_QUERY_LENGTH = 100;
const PER_GROUP = 5;

const querySchema = z
  .string()
  .max(500)
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().max(MAX_QUERY_LENGTH, `Search terms can be up to ${MAX_QUERY_LENGTH} characters.`));

interface WorkspacePage {
  key: string;
  title: string;
  subtitle: string;
  /** Path below /home/{org}. */
  path: string;
  keywords: string[];
  permission: Permission;
}

/** Static destinations. Each is shown only when the caller holds its permission. */
const workspacePages: WorkspacePage[] = [
  { key: "home", title: "Home", subtitle: "Views and your metrics", path: "", keywords: ["dashboard", "overview", "metrics", "views"], permission: "workspace:read" },
  { key: "live", title: "Live", subtitle: "Rolling views", path: "/live", keywords: ["real time", "realtime", "globe", "views", "now"], permission: "workspace:read" },
  { key: "organic", title: "Organic", subtitle: "Campaigns, playbooks and posts", path: "/campaigns", keywords: ["campaigns", "playbooks", "posts", "reporting", "views", "spend", "cpm"], permission: "workspace:read" },
  { key: "new-campaign", title: "New campaign", subtitle: "Create a campaign", path: "/campaigns/new", keywords: ["create", "campaign", "budget"], permission: "campaign:manage" },
  { key: "ads", title: "Ads", subtitle: "Paid ads and submissions", path: "/ads", keywords: ["paid", "submissions", "meta", "tiktok", "impressions"], permission: "workspace:read" },
  { key: "new-ads", title: "Create ads", subtitle: "Run creator posts as ads", path: "/ads/new?pick=1", keywords: ["create", "ads", "launch", "paid"], permission: "ads:launch" },
  { key: "creators", title: "Creators", subtitle: "Your creator roster", path: "/creators", keywords: ["creators", "roster", "influencers", "people"], permission: "workspace:read" },
  { key: "integrations", title: "Integrations", subtitle: "Settings", path: "/integrations", keywords: ["connect", "app store", "google play", "meta", "tiktok", "api", "mcp", "ai"], permission: "workspace:read" },
  { key: "ad-settings", title: "Ad settings", subtitle: "Settings", path: "/ad-settings", keywords: ["copy", "naming", "tracking", "utm", "cta", "defaults"], permission: "workspace:read" },
  { key: "members", title: "Members", subtitle: "Settings", path: "/members", keywords: ["team", "invite", "roles", "owners", "teammates"], permission: "workspace:read" },
  { key: "branding", title: "Branding", subtitle: "Settings", path: "/branding", keywords: ["brand", "logo", "cover", "hashtag", "description", "color"], permission: "workspace:read" },
  { key: "billing", title: "Billing", subtitle: "Settings", path: "/billing", keywords: ["plan", "payment", "invoices", "credits", "threshold", "upgrade"], permission: "billing:view" },
];

function matchesPage(page: WorkspacePage, terms: string[]): boolean {
  const haystack = [page.title, page.subtitle, ...page.keywords].join(" ").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Prefix matches rank above substring matches; ties sort alphabetically. */
function prefixFirst(column: AnyColumn, prefix: string): SQL {
  return sql`case when lower(${column}) like ${`${escapeLike(prefix.toLowerCase())}%`} then 0 else 1 end`;
}

function snippet(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Searches the caller's workspace. An empty query returns the permitted pages only. */
export async function searchWorkspaceAction(orgSlug: string, rawQuery: string): Promise<ActionResult<SearchResults>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(orgSlug, "workspace:read");
    const parsed = querySchema.safeParse(rawQuery);
    if (!parsed.success) return fromZodError(parsed.error, parsed.error.issues[0]?.message ?? "Check your search.");
    const query = parsed.data;
    const base = `/home/${ctx.org.slug}`;
    const orgId = ctx.org.id;
    const terms = query.toLowerCase().split(" ").filter(Boolean);

    const pageItems: SearchResultItem[] = workspacePages
      .filter((p) => hasPermission(ctx, p.permission) && matchesPage(p, terms))
      .map((p) => ({ id: `page:${p.key}`, kind: "page", title: p.title, subtitle: p.subtitle, href: `${base}${p.path}` }));
    if (!query) return ok({ query, groups: [{ kind: "page", label: "Pages", items: pageItems }] });

    const db = await getDb();
    const like = `%${escapeLike(query)}%`;
    const tagLike = `%${escapeLike(query.replace(/^#/, "").toLowerCase())}%`;

    const campaignRows = await db
      .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, hashtag: campaigns.primaryHashtag })
      .from(campaigns)
      .where(and(eq(campaigns.orgId, orgId), or(ilike(campaigns.name, like), ilike(campaigns.primaryHashtag, tagLike))))
      .orderBy(prefixFirst(campaigns.name, query), asc(campaigns.name))
      .limit(PER_GROUP);

    const playbookRows = await db
      .select({ id: playbooks.id, name: playbooks.name, status: playbooks.status, campaignName: campaigns.name })
      .from(playbooks)
      .innerJoin(campaigns, and(eq(campaigns.id, playbooks.campaignId), eq(campaigns.orgId, orgId)))
      .where(and(eq(playbooks.orgId, orgId), ilike(playbooks.name, like)))
      .orderBy(prefixFirst(playbooks.name, query), asc(playbooks.name))
      .limit(PER_GROUP);

    const handleQuery = query.replace(/^@/, "");
    const postRows = await db
      .select({ id: posts.id, handle: posts.handle, caption: posts.caption, platform: posts.platform })
      .from(posts)
      .where(
        and(
          eq(posts.orgId, orgId),
          eq(posts.reviewStatus, "approved"),
          or(ilike(posts.handle, `%${escapeLike(handleQuery)}%`), ilike(posts.caption, like)),
        ),
      )
      .orderBy(prefixFirst(posts.handle, handleQuery), sql`coalesce(${posts.postedAt}, ${posts.submittedAt}) desc`)
      .limit(PER_GROUP);

    // Creators associated with this organization: on its roster, admitted to/requesting one of its campaigns, or with a post in it.
    const associated = or(
      exists(db.select({ one: sql`1` }).from(orgCreators).where(and(eq(orgCreators.creatorId, creators.id), eq(orgCreators.orgId, orgId)))),
      exists(db.select({ one: sql`1` }).from(campaignMemberships).where(and(eq(campaignMemberships.creatorId, creators.id), eq(campaignMemberships.orgId, orgId)))),
      exists(db.select({ one: sql`1` }).from(posts).where(and(eq(posts.creatorId, creators.id), eq(posts.orgId, orgId)))),
    );
    const handleMatch = exists(
      db
        .select({ one: sql`1` })
        .from(socialAccounts)
        .where(and(eq(socialAccounts.creatorId, creators.id), ilike(socialAccounts.handle, `%${escapeLike(handleQuery)}%`))),
    );
    const creatorRows = await db
      .select({ id: creators.id, name: creators.displayName })
      .from(creators)
      .where(and(associated, or(ilike(creators.displayName, like), handleMatch)))
      .orderBy(prefixFirst(creators.displayName, query), asc(creators.displayName))
      .limit(PER_GROUP);

    const groups: SearchResultGroup[] = [
      {
        kind: "campaign",
        label: "Campaigns",
        items: campaignRows.map((c) => ({
          id: `campaign:${c.id}`,
          kind: "campaign",
          title: c.name,
          subtitle: `#${c.hashtag} · ${campaignStatusLabels[c.status]}`,
          href: `${base}/campaigns?tab=playbooks&campaign=${encodeURIComponent(c.id)}`,
        })),
      },
      {
        kind: "playbook",
        label: "Playbooks",
        items: playbookRows.map((p) => ({
          id: `playbook:${p.id}`,
          kind: "playbook",
          title: p.name,
          subtitle: `${p.campaignName} · ${p.status === "published" ? "Published" : "Draft"}`,
          href: `${base}/playbooks/${encodeURIComponent(p.id)}/edit`,
        })),
      },
      {
        kind: "post",
        label: "Posts",
        items: postRows.map((p) => ({
          id: `post:${p.id}`,
          kind: "post",
          title: `@${p.handle}`,
          subtitle: [platformLabels[p.platform], p.caption ? snippet(p.caption) : null].filter(Boolean).join(" · "),
          href: `${base}/campaigns?tab=posts&search=${encodeURIComponent(p.handle)}`,
        })),
      },
      {
        kind: "creator",
        label: "Creators",
        items: creatorRows.map((c) => ({
          id: `creator:${c.id}`,
          kind: "creator",
          title: c.name,
          subtitle: null,
          href: `${base}/creators?search=${encodeURIComponent(c.name)}`,
        })),
      },
      { kind: "page", label: "Pages", items: pageItems },
    ];
    return ok({ query, groups: groups.filter((g) => g.items.length > 0) });
  });
}
