import Link from "next/link";
import { Plus } from "lucide-react";
import {
  campaignSorts,
  defaultOrderFor,
  hasPostFilters,
  isRangeMetric,
  organicHref,
  playbookSorts,
  postSortKeys,
  sortPatch,
  type OrganicState,
} from "@/domain/organic-url-state";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, InlineAlert } from "@/components/ui/feedback";
import { Card } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/table";
import { getCampaign } from "@/server/campaigns-core";
import {
  awaitingFirstMetrics,
  listCampaignRows,
  listPlaybookRows,
  loadDailyChart,
  loadFilterChoices,
  loadMetricsFreshness,
  loadPostMetricSummary,
  loadPostsPage,
  resolveFilterLabels,
  workspaceHasPosts,
  type MetricsFreshness,
  type Paged,
} from "@/server/organic";
import { CampaignsTable } from "./campaigns-table";
import { campaignSortLabels, playbookSortLabels, postSortLabels, type SortLink } from "./columns";
import { DailyChart, type ChartState } from "./daily-chart";
import { LocalDateTime } from "./local-time";
import { MetricCards } from "./metric-cards";
import { PlaybooksTable } from "./playbooks-table";
import { PostGrid, PostTable } from "./post-results";
import { ComparisonControl, PostFilterBar, PostListControls } from "./posts-toolbar";

/**
 * Organic tab bodies. Each loads its own data (behind a Suspense boundary in
 * the page) with the orgId from the page's authorized context; URL state only
 * selects within that workspace.
 */

export interface SectionContext {
  orgId: string;
  slug: string;
  /** /home/{slug}/campaigns */
  basePath: string;
  state: OrganicState;
}

function sortLinks<K extends string>(ctx: SectionContext, keys: readonly K[], labels: Record<K, string>): Record<K, SortLink> {
  return Object.fromEntries(
    keys.map((key) => {
      const active = ctx.state.sort === key;
      return [key, { label: labels[key], active, direction: active ? ctx.state.order : defaultOrderFor(key), href: organicHref(ctx.basePath, ctx.state, sortPatch(ctx.state, key)) }];
    }),
  ) as Record<K, SortLink>;
}

function pageLinks(ctx: SectionContext, page: Paged<unknown> | { total: number; page: number; pageSize: number }) {
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));
  return {
    prevHref: page.page > 1 ? organicHref(ctx.basePath, ctx.state, { page: Math.min(page.page - 1, lastPage) }) : null,
    nextHref: page.page < lastPage ? organicHref(ctx.basePath, ctx.state, { page: page.page + 1 }) : null,
  };
}

function PastLastPage({ ctx, noun }: { ctx: SectionContext; noun: string }) {
  return (
    <EmptyState
      title="This page is empty"
      description={`There are fewer ${noun} than this page number suggests. They may have changed since the link was made.`}
      action={
        <ButtonLink href={organicHref(ctx.basePath, ctx.state, { page: 1 })} variant="secondary" size="sm">
          Go to the first page
        </ButtonLink>
      }
    />
  );
}

/**
 * Report status above each tab: metrics not reported yet (values show "—",
 * never 0), possibly out of date (last values kept, with the time), or the
 * time of the last report; plus the viewer's permission note.
 */
function SectionNotices({ awaiting, freshness, permissionNote }: { awaiting: boolean; freshness: MetricsFreshness; permissionNote?: string | null }) {
  const lastReported = freshness.lastReportedAt;
  return (
    <>
      {awaiting ? (
        <InlineAlert tone="info" title="Metrics aren't available yet" className="mb-4">
          You have approved posts, but no metrics source has reported views for them yet. Views, spend and CPM show “—” until reporting starts — they aren&apos;t zero.
        </InlineAlert>
      ) : freshness.stale && lastReported ? (
        <InlineAlert tone="warning" title="Metrics may be out of date" className="mb-4">
          The last metrics report arrived <LocalDateTime iso={lastReported} />. The numbers below are the last reported values, so recent views and spend may be missing.
        </InlineAlert>
      ) : null}
      {permissionNote || (lastReported && !freshness.stale) ? (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px] text-muted">
          <p>{permissionNote}</p>
          {lastReported && !freshness.stale ? (
            <p>
              Metrics last reported <LocalDateTime iso={lastReported} />
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------------------
 * Campaigns
 * ------------------------------------------------------------------------- */

export async function CampaignsSection({ ctx, canManage, createdId = null }: { ctx: SectionContext; canManage: boolean; createdId?: string | null }) {
  const sort = campaignSorts.find((s) => s === ctx.state.sort) ?? "views";
  const [page, awaiting, freshness, created] = await Promise.all([
    listCampaignRows(ctx.orgId, { range: ctx.state.range, sort, order: ctx.state.order, page: ctx.state.page }),
    awaitingFirstMetrics(ctx.orgId),
    loadMetricsFreshness(ctx.orgId),
    // Tenant-qualified: an ID from another workspace (or an unknown one) is simply ignored.
    createdId ? getCampaign(ctx.orgId, createdId) : Promise.resolve(null),
  ]);

  if (page.total === 0) {
    return (
      <Card>
        <EmptyState
          title="No campaigns yet"
          description={
            canManage
              ? "A campaign sets the budget, platforms and creators for your posts. Campaigns start inactive, so nothing is spent until you activate one."
              : "A workspace owner creates campaigns. Once one exists, its views, spend and budget appear here."
          }
          action={
            canManage ? (
              <ButtonLink href={`/home/${ctx.slug}/campaigns/new`} size="sm">
                <Plus className="size-3.5" aria-hidden="true" />
                New Campaign
              </ButtonLink>
            ) : null
          }
        />
      </Card>
    );
  }

  return (
    <>
      {created ? <CreatedCampaignNotice name={created.name} status={created.status} visible={page.rows.some((r) => r.id === created.id)} /> : null}
      <SectionNotices
        awaiting={awaiting}
        freshness={freshness}
        permissionNote={canManage ? null : "Only workspace owners can activate, pause or change budgets. You can view every campaign."}
      />
      <Card className="overflow-hidden">
        {page.rows.length ? (
          <CampaignsTable
            highlightId={created?.id ?? null}
            slug={ctx.slug}
            rows={page.rows}
            sortLinks={sortLinks(ctx, campaignSorts, campaignSortLabels)}
            drilldownHrefs={Object.fromEntries(page.rows.map((r) => [r.id, organicHref(ctx.basePath, ctx.state, { tab: "playbooks", campaign: r.id, playbook: null })]))}
            range={ctx.state.range}
            canManage={canManage}
            metricsAvailable={!awaiting}
          />
        ) : (
          <PastLastPage ctx={ctx} noun="campaigns" />
        )}
        <div className="border-t border-line">
          <Pagination page={page.page} pageSize={page.pageSize} total={page.total} {...pageLinks(ctx, page)} />
        </div>
      </Card>
    </>
  );
}

/** Shown after the New Campaign flow: the campaign exists, but nothing runs or spends until someone activates it. */
function CreatedCampaignNotice({ name, status, visible }: { name: string; status: string; visible: boolean }) {
  const inactive = status === "inactive";
  return (
    <InlineAlert tone="success" title={`Campaign “${name}” created`} className="mb-4">
      {inactive
        ? "It stays Inactive until you activate it, so nothing is spent and creators can't post to it yet."
        : "Its current status is shown in the Active column."}
      {visible ? " It's highlighted in the table below." : null}
    </InlineAlert>
  );
}

/* ----------------------------------------------------------------------------
 * Playbooks
 * ------------------------------------------------------------------------- */

export async function PlaybooksSection({ ctx, canPublish, canEdit }: { ctx: SectionContext; canPublish: boolean; canEdit: boolean }) {
  const sort = playbookSorts.find((s) => s === ctx.state.sort) ?? "views";
  const campaignFilter = ctx.state.campaign && ctx.state.campaign !== "0" ? ctx.state.campaign : null;
  const [labels, page, awaiting, freshness] = await Promise.all([
    resolveFilterLabels(ctx.orgId, { campaign: campaignFilter, playbook: null }),
    listPlaybookRows(ctx.orgId, { range: ctx.state.range, campaignId: campaignFilter, sort, order: ctx.state.order, page: ctx.state.page }),
    awaitingFirstMetrics(ctx.orgId),
    loadMetricsFreshness(ctx.orgId),
  ]);
  const clearHref = organicHref(ctx.basePath, ctx.state, { campaign: null });

  if (labels.campaign && !labels.campaign.found) {
    return (
      <Card>
        <EmptyState
          title="Campaign not found"
          description="This campaign doesn't exist in this workspace, or it was deleted."
          action={
            <ButtonLink href={clearHref} variant="secondary" size="sm">
              Show all playbooks
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  if (page.total === 0) {
    return (
      <Card>
        <EmptyState
          title={labels.campaign ? `No playbooks in ${labels.campaign.label} yet` : "No playbooks yet"}
          description={
            canEdit
              ? "A playbook tells creators what to make for a campaign. Use Create Playbook to start a draft; nothing is shown to creators until it's published and turned on."
              : "Playbooks tell creators what to make for a campaign."
          }
          action={
            labels.campaign ? (
              <Link href={clearHref} scroll={false} className="text-sm font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
                Show playbooks from all campaigns
              </Link>
            ) : null
          }
        />
      </Card>
    );
  }

  return (
    <>
      <SectionNotices awaiting={awaiting} freshness={freshness} permissionNote={canPublish ? null : "Only workspace owners can turn published playbooks on or off."} />
      <Card className="overflow-hidden">
        {page.rows.length ? (
          <PlaybooksTable
            slug={ctx.slug}
            rows={page.rows}
            sortLinks={sortLinks(ctx, playbookSorts, playbookSortLabels)}
            range={ctx.state.range}
            canPublish={canPublish}
            canEdit={canEdit}
            metricsAvailable={!awaiting}
          />
        ) : (
          <PastLastPage ctx={ctx} noun="playbooks" />
        )}
        <div className="border-t border-line">
          <Pagination page={page.page} pageSize={page.pageSize} total={page.total} {...pageLinks(ctx, page)} />
        </div>
      </Card>
    </>
  );
}

/* ----------------------------------------------------------------------------
 * Posts
 * ------------------------------------------------------------------------- */

export async function PostsSection({ ctx, canManage }: { ctx: SectionContext; canManage: boolean }) {
  const s = ctx.state;
  const filters = { campaign: s.campaign, playbook: s.playbook, platform: s.platform };
  const chartMetric = isRangeMetric(s.chart) ? s.chart : null;
  const [summary, page, hasPosts, choices, labels, freshness] = await Promise.all([
    loadPostMetricSummary(ctx.orgId, { ...filters, range: s.range, mode: s.mode }),
    loadPostsPage(ctx.orgId, { ...filters, range: s.range, mode: s.mode, review: s.review, q: s.q, sort: s.sort, order: s.order, page: s.page }),
    workspaceHasPosts(ctx.orgId),
    loadFilterChoices(ctx.orgId, s.campaign),
    resolveFilterLabels(ctx.orgId, { campaign: s.campaign, playbook: s.playbook }),
    loadMetricsFreshness(ctx.orgId),
  ]);
  const chart: ChartState =
    chartMetric === null
      ? { kind: "lifetime", metric: s.chart }
      : summary.status === "awaiting_metrics"
        ? { kind: "awaiting" }
        : { kind: "data", data: await loadDailyChart(ctx.orgId, { ...filters, range: s.range, metric: chartMetric, comparison: s.comparisons }) };

  const lastPage = Math.max(1, Math.ceil(page.meta.total / page.meta.page_size));
  return (
    <div className="space-y-4">
      <div>
        <SectionNotices awaiting={summary.status === "awaiting_metrics"} freshness={freshness} />
        <PostFilterBar basePath={ctx.basePath} state={s} choices={choices} labels={labels} />
      </div>
      <MetricCards basePath={ctx.basePath} state={s} summary={summary} />
      <Card className="p-4">
        <div className="mb-3">
          <ComparisonControl basePath={ctx.basePath} state={s} />
        </div>
        <DailyChart state={chart} />
      </Card>

      <section aria-labelledby="organic-posts-heading" className="pt-2">
        <h2 id="organic-posts-heading" className="sr-only">
          Posts
        </h2>
        <PostListControls basePath={ctx.basePath} state={s} />
        <div className="mt-4">
          {page.data.length ? (
            s.view === "table" ? (
              <Card className="overflow-hidden">
                <PostTable posts={page.data} sortLinks={sortLinks(ctx, postSortKeys, postSortLabels)} />
              </Card>
            ) : (
              <PostGrid posts={page.data} />
            )
          ) : (
            <Card>
              <PostsEmpty ctx={ctx} hasPosts={hasPosts} total={page.meta.total} canManage={canManage} />
            </Card>
          )}
        </div>
        {page.meta.total > 0 ? (
          <div className="mt-3 rounded-[12px] border border-line">
            <Pagination
              page={page.meta.page}
              pageSize={page.meta.page_size}
              total={page.meta.total}
              prevHref={s.page > 1 ? organicHref(ctx.basePath, s, { page: Math.min(s.page - 1, lastPage) }) : null}
              nextHref={s.page < lastPage ? organicHref(ctx.basePath, s, { page: s.page + 1 }) : null}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PostsEmpty({ ctx, hasPosts, total, canManage }: { ctx: SectionContext; hasPosts: boolean; total: number; canManage: boolean }) {
  const s = ctx.state;
  if (!hasPosts) {
    return (
      <EmptyState
        title="No posts yet"
        description="Posts appear here when creators publish with one of your campaigns' hashtags. Campaigns start inactive — creators can only join active campaigns."
        action={
          canManage ? (
            <ButtonLink href={organicHref(ctx.basePath, s, { tab: "campaigns" })} variant="secondary" size="sm">
              Go to campaigns
            </ButtonLink>
          ) : null
        }
      />
    );
  }
  if (total > 0) return <PastLastPage ctx={ctx} noun="posts" />;
  if (hasPostFilters(s)) {
    return (
      <EmptyState
        title="No posts match these filters"
        description="Your workspace has posts, but none match the current search and filters in this date range."
        action={
          <ButtonLink href={organicHref(ctx.basePath, s, { campaign: null, playbook: null, platform: null, review: null, q: "" })} variant="secondary" size="sm">
            Clear search and filters
          </ButtonLink>
        }
      />
    );
  }
  return (
    <EmptyState
      title="Nothing to see here yet"
      description={s.mode === "created" ? "No posts were created in the selected period." : "No posts gained views in the selected period."}
      action={
        s.mode === "created" ? (
          <Link href={organicHref(ctx.basePath, s, { mode: "active" })} scroll={false} className="text-sm font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
            Show posts active in this range instead
          </Link>
        ) : null
      }
    />
  );
}
