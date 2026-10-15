import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hasPermission, loadOrgContext, requireOrgPage } from "@/server/authz";
import {
  ACTIVITY_WEEKS,
  listRoster,
  loadCreatorDetail,
  parseRosterQuery,
  rosterCampaignOptions,
  rosterCounts,
  rosterQueryString,
  rosterSorts,
  rosterSummary,
  type RosterQuery,
  type RosterSort,
} from "@/server/creators-roster";
import { Card } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/feedback";
import { LinkTabs } from "@/components/ui/tabs";
import { buttonClasses } from "@/components/ui/button";
import { CreatorDrawer } from "@/components/creators/creator-drawer";
import { RosterFilters } from "@/components/creators/roster-filters";
import { RosterTable, type SortLink } from "@/components/creators/roster-table";
import { SummaryCards } from "@/components/creators/summary-cards";
import { removeCreatorsAction, restoreCreatorsAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Creators · ${ctx.org.name}` : "Creators" };
}

/** Numeric columns sort high→low first; names and levels low→high. */
const firstDirection = (sort: RosterSort): "asc" | "desc" => (sort === "creator" ? "asc" : "desc");

/**
 * Creators roster (L10): All / Removed tabs, leader cards, search and filters,
 * a sortable server-paginated table and a creator detail sheet. View state is
 * in the URL (`tab`, `q`, `campaign`, `level`, `platform`, `sort`, `order`,
 * `page`, `creator`).
 */
export default async function CreatorsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/creators`);
  const query = parseRosterQuery(await searchParams);
  const basePath = `/home/${ctx.org.slug}/creators`;
  const href = (patch: Partial<RosterQuery>) => `${basePath}${rosterQueryString(query, patch)}`;
  const canManage = hasPermission(ctx, "creator:manage");

  const [counts, summary, table, campaigns, detail] = await Promise.all([
    rosterCounts(ctx),
    rosterSummary(ctx),
    listRoster(ctx, query),
    rosterCampaignOptions(ctx),
    query.creator ? loadCreatorDetail(ctx, query.creator) : Promise.resolve(null),
  ]);

  const sortLinks = Object.fromEntries(
    rosterSorts.map((sort) => {
      const active = query.sort === sort;
      const nextOrder = active ? (query.order === "asc" ? "desc" : "asc") : firstDirection(sort);
      const link: SortLink = { href: href({ sort, order: nextOrder, page: 1, creator: null }), active, direction: active ? query.order : firstDirection(sort) };
      return [sort, link];
    }),
  ) as Record<RosterSort, SortLink>;
  const detailHrefs = Object.fromEntries(table.rows.map((row) => [row.id, href({ creator: row.id })]));
  const detailHref = (creatorId: string) => href({ creator: creatorId });
  const filtered = Boolean(query.q || query.campaign || query.level || query.platform);
  const totalPages = Math.max(1, Math.ceil(table.total / table.pageSize));
  const removeAction = removeCreatorsAction.bind(null, ctx.org.slug);
  const restoreAction = restoreCreatorsAction.bind(null, ctx.org.slug);

  const empty = filtered ? (
    <EmptyState
      title="No creators match these filters"
      description="Try a different name or handle, or clear the filters."
      action={
        <Link href={href({ q: "", campaign: null, level: null, platform: null, page: 1, creator: null })} className={buttonClasses("secondary", "sm")}>
          Clear filters
        </Link>
      }
    />
  ) : query.tab === "removed" ? (
    <EmptyState title="No removed creators" description="Creators you remove from your roster appear here, and you can restore them at any time." />
  ) : (
    <EmptyState
      title="No creators yet"
      description="Creators appear here once they join one of your campaigns or have a post approved. Publish a playbook so creators know what to make."
    />
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <h1 className="mb-4 text-xl font-semibold leading-7 text-ink">Creators</h1>
      <LinkTabs
        label="Creator roster"
        activeKey={query.tab}
        className="mb-5"
        tabs={[
          { key: "all", label: "All your creators", href: `${basePath}${rosterQueryString({ ...query, tab: "all", page: 1, creator: null })}`, count: counts.all },
          { key: "removed", label: "Removed", href: `${basePath}${rosterQueryString({ ...query, tab: "removed", page: 1, creator: null })}`, count: counts.removed },
        ]}
      />

      <section aria-label="Top creators" className="mb-5">
        <SummaryCards summary={summary} detailHref={detailHref} />
      </section>

      <div className="mb-3">
        <RosterFilters
          key={query.tab}
          campaigns={campaigns}
          values={{
            tab: query.tab,
            q: query.q,
            campaign: query.campaign ?? "",
            level: query.level ?? "",
            platform: query.platform ?? "",
            sort: query.sort === "views" && query.order === "desc" ? null : query.sort,
            order: query.sort === "views" && query.order === "desc" ? null : query.order,
          }}
        />
      </div>

      <Card className="overflow-hidden">
        <RosterTable
          rows={table.rows}
          tab={query.tab}
          canManage={canManage}
          sortLinks={sortLinks}
          detailHrefs={detailHrefs}
          activityEnd={table.activityEnd}
          activityWeeks={ACTIVITY_WEEKS}
          empty={empty}
          removeAction={removeAction}
          restoreAction={restoreAction}
        />
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5 text-[13px] text-muted">
          <p>
            Page {table.page} of {totalPages} · {table.total.toLocaleString("en-US")} total {table.total === 1 ? "creator" : "creators"}
          </p>
          <div className="flex gap-2">
            <PageLink href={table.page > 1 ? href({ page: table.page - 1, creator: null }) : null} label="Previous" icon="prev" />
            <PageLink href={table.page < totalPages ? href({ page: table.page + 1, creator: null }) : null} label="Next" icon="next" />
          </div>
        </nav>
      </Card>
      {!canManage ? <p className="mt-3 text-[13px] text-muted">Only workspace owners can remove or restore creators.</p> : null}

      {detail ? (
        <CreatorDrawer
          key={detail.id}
          detail={detail}
          closeHref={href({ creator: null })}
          canManage={canManage}
          removeAction={removeAction}
          restoreAction={restoreAction}
        />
      ) : null}
    </div>
  );
}

function PageLink({ href, label, icon }: { href: string | null; label: string; icon: "prev" | "next" }) {
  const content = (
    <>
      {icon === "prev" ? <ChevronLeft className="size-3.5" aria-hidden="true" /> : null}
      {label}
      {icon === "next" ? <ChevronRight className="size-3.5" aria-hidden="true" /> : null}
    </>
  );
  const cls = "inline-flex h-8 items-center gap-1 rounded-[8px] border border-line px-2.5 text-[13px] max-md:h-11";
  return href ? (
    <Link href={href} scroll={false} className={`${cls} text-ink hover:bg-hover`}>
      {content}
    </Link>
  ) : (
    <span className={`${cls} text-subtle`} aria-disabled="true">
      {content}
    </span>
  );
}
