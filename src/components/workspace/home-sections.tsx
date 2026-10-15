import Link from "next/link";
import { useId, type ReactNode } from "react";
import { ArrowRight, ExternalLink, Info, PlugZap } from "lucide-react";
import { platformLabels, type Platform } from "@/domain/campaign";
import type { DateRange } from "@/domain/date-range";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, MetricValue } from "@/components/ui/feedback";
import { adProviderLabels, loadHomeMetrics, loadRollingCounters, type ActiveCampaignSummary, type AdReportingState, type OrganicSummary, type RecentPosts } from "@/server/home";
import { formatCount, formatUsd } from "@/lib/money";
import { formatShortDay, formatUtcInstant } from "./format";
import { RollingViewCounters } from "./rolling-view-counters";
import { ViewsTrend } from "./views-trend";

/**
 * Home (L01) sections. Each async section loads its own data so the greeting
 * and date picker render immediately and every block streams in behind a
 * stable-size skeleton. `orgId` always comes from the page's authorized context.
 */

export interface HomeLinks {
  /** /home/{org} */
  base: string;
  /** "from=YYYY-MM-DD&to=YYYY-MM-DD" for the selected range. */
  rangeQuery: string;
}

/* ----------------------------------------------------------------------------
 * Rolling counters
 * ------------------------------------------------------------------------- */

export async function HomeCounters({ orgId }: { orgId: string }) {
  const counters = await loadRollingCounters(orgId);
  return <RollingViewCounters counters={counters} size="lg" />;
}

/* ----------------------------------------------------------------------------
 * "Your metrics"
 * ------------------------------------------------------------------------- */

export async function HomeMetrics({ orgId, range, links, canManageCampaigns }: { orgId: string; range: DateRange; links: HomeLinks; canManageCampaigns: boolean }) {
  const metrics = await loadHomeMetrics(orgId, range);
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OrganicViewsCard organic={metrics.organic} href={`${links.base}/campaigns?tab=posts&${links.rangeQuery}`} />
        <AdImpressionsCard ads={metrics.ads} href={`${links.base}/ads?${links.rangeQuery}`} integrationsHref={`${links.base}/integrations`} />
      </div>
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">
        <ActiveCampaigns campaigns={metrics.activeCampaigns} campaignCount={metrics.campaignCount} links={links} canManageCampaigns={canManageCampaigns} />
        <RecentPostsList posts={metrics.posts} href={`${links.base}/campaigns?tab=posts&${links.rangeQuery}`} />
      </div>
    </>
  );
}

function MetricCard({ title, link, children }: { title: string; link: { href: string; label: string }; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex min-h-[212px] flex-col rounded-[12px] border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 id={headingId} className="text-[15px] font-semibold text-ink">
          {title}
        </h3>
        <Link href={link.href} className="-my-3 inline-flex min-h-11 items-center gap-1 text-[12px] md:my-0 md:min-h-6 font-medium text-muted hover:text-ink">
          {link.label}
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function BigNumber({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[28px] font-semibold leading-9 text-ink">{children}</p>;
}

function OrganicViewsCard({ organic, href }: { organic: OrganicSummary; href: string }) {
  return (
    <MetricCard title="Organic views" link={{ href, label: "Organic" }}>
      {organic.status === "unavailable" ? (
        <>
          <BigNumber>
            <span aria-hidden="true" className="text-muted">
              —
            </span>
            <span className="sr-only">Unavailable</span>
          </BigNumber>
          <p className="mt-1 text-[13px] text-muted">{organic.reason}</p>
        </>
      ) : (
        <>
          <BigNumber>{formatCount(organic.totalViews)}</BigNumber>
          {organic.totalViews > 0 ? (
            <ViewsTrend series={organic.series} total={organic.totalViews} />
          ) : (
            <p className="mt-1 text-[13px] text-muted">No views in this period yet.</p>
          )}
        </>
      )}
    </MetricCard>
  );
}

function providerList(providers: Array<keyof typeof adProviderLabels>): string {
  return providers.map((p) => adProviderLabels[p]).join(" and ");
}

/** Never a number: no ad reporting pipeline exists yet, so the card explains the actual state. */
function AdImpressionsCard({ ads, href, integrationsHref }: { ads: AdReportingState; href: string; integrationsHref: string }) {
  return (
    <MetricCard title="Ad impressions" link={{ href, label: "Ads" }}>
      <div className="mt-3 flex flex-1 flex-col items-start gap-3">
        {ads.status === "not_connected" ? (
          <p className="text-[13px] leading-5 text-ink-2">Connect a Meta or TikTok ad account to run your posts as ads.</p>
        ) : ads.status === "needs_attention" ? (
          <p className="flex gap-2 text-[13px] leading-5 text-ink-2">
            <PlugZap className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>Your {providerList(ads.providers)} connection needs attention. Reconnect it to run your posts as ads.</span>
          </p>
        ) : (
          <div className="flex gap-2 text-[13px] leading-5">
            <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
            <div>
              <p className="font-medium text-ink">Ad reporting isn&apos;t available yet</p>
              <p className="text-muted">
                {providerList(ads.providers)} {ads.providers.length > 1 ? "are" : "is"} connected, but impressions aren&apos;t imported on this deployment yet, so no number is
                shown.
              </p>
            </div>
          </div>
        )}
        {ads.status !== "reporting_unavailable" ? (
          <ButtonLink href={integrationsHref} variant="secondary" size="sm" className="mt-auto max-md:min-h-11">
            Go to Integrations
          </ButtonLink>
        ) : null}
      </div>
    </MetricCard>
  );
}

/* ----------------------------------------------------------------------------
 * Active campaigns and posts
 * ------------------------------------------------------------------------- */

function SectionHeading({ id, title, action }: { id: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-xl font-semibold leading-7 text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}

function SmallLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="-my-3 inline-flex min-h-11 items-center gap-1 text-[12px] md:my-0 md:min-h-6 font-medium text-muted hover:text-ink">
      {children}
      <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  );
}

function ActiveCampaigns({
  campaigns,
  campaignCount,
  links,
  canManageCampaigns,
}: {
  campaigns: ActiveCampaignSummary[];
  campaignCount: number;
  links: HomeLinks;
  canManageCampaigns: boolean;
}) {
  const headingId = useId();
  let guidance: ReactNode = null;
  if (campaignCount === 0) {
    guidance = canManageCampaigns ? (
      <ButtonLink href={`${links.base}/campaigns/new`} variant="secondary" size="sm" className="max-md:min-h-11">
        Create a campaign
      </ButtonLink>
    ) : (
      <p className="text-[13px] text-muted">A workspace owner can create your first campaign.</p>
    );
  }
  return (
    <section aria-labelledby={headingId}>
      <SectionHeading id={headingId} title="Active Campaigns" action={<SmallLink href={`${links.base}/campaigns?tab=campaigns&${links.rangeQuery}`}>All campaigns</SmallLink>} />
      <div className="mt-3 rounded-[12px] border border-line bg-surface">
        {campaigns.length === 0 ? (
          <EmptyState title="Nothing to see here yet" description="No active campaigns with earnings in this period." action={guidance} />
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">Active campaigns with earnings in this period, highest spend first</caption>
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Campaign
                </th>
                <th scope="col" className="w-24 px-4 py-2.5 text-right font-medium sm:w-28">
                  Views
                </th>
                <th scope="col" className="w-24 px-4 py-2.5 text-right font-medium sm:w-28">
                  Spend
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <th scope="row" className="truncate px-4 py-3 font-medium">
                    <Link href={`${links.base}/campaigns?tab=playbooks&campaign=${encodeURIComponent(c.id)}&${links.rangeQuery}`} className="text-ink hover:underline">
                      {c.name}
                    </Link>
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-2">{formatCount(c.views)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-2">{formatUsd(c.spendCents, { decimals: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

const platformInitials: Record<Platform, string> = { tiktok: "TT", youtube: "YT", instagram: "IG", snapchat: "SC", facebook_reels: "FB" };

function isWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function RecentPostsList({ posts, href }: { posts: RecentPosts; href: string }) {
  const headingId = useId();
  const n = posts.totalInRange;
  return (
    <section aria-labelledby={headingId}>
      <SectionHeading id={headingId} title={`${formatCount(n)} ${n === 1 ? "post" : "posts"}`} action={<SmallLink href={href}>View all posts</SmallLink>} />
      <div className="mt-3 rounded-[12px] border border-line bg-surface">
        {posts.items.length === 0 ? (
          posts.workspaceHasPosts ? (
            <EmptyState title="No posts in this period" description="Choose a longer date range to see earlier posts." />
          ) : (
            <EmptyState title="No posts yet" description="No posts in this period. Approved creator posts for your campaigns appear here." />
          )
        ) : (
          <ul aria-label="Most recent posts in this period" className="text-sm">
            {posts.items.map((p) => {
              const day = p.posted_at ? p.posted_at.slice(0, 10) : null;
              return (
                <li key={p.content_id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-selected text-[11px] font-semibold text-ink-2">
                    {platformInitials[p.platform]}
                  </span>
                  <div className="min-w-0 flex-1">
                    {isWebUrl(p.url) ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 font-medium text-ink hover:underline">
                        <span className="truncate">@{p.handle}</span>
                        <ExternalLink className="size-3 shrink-0 text-muted" aria-hidden="true" />
                        <span className="sr-only">(opens the post in a new tab)</span>
                      </a>
                    ) : (
                      <p className="truncate font-medium text-ink">@{p.handle}</p>
                    )}
                    <p className="truncate text-xs text-muted">
                      {platformLabels[p.platform]}
                      {day && p.posted_at ? (
                        <>
                          {" · "}
                          <time dateTime={p.posted_at} title={formatUtcInstant(new Date(p.posted_at))}>
                            {formatShortDay(day)}
                          </time>
                        </>
                      ) : null}
                      {p.playbook_name ? ` · ${p.playbook_name}` : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums text-ink">
                      <MetricValue value={p.views} format={formatCount} />
                    </p>
                    <p className="text-[11px] text-muted">views</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
