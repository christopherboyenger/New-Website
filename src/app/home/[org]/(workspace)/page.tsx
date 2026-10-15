import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { normalizeRange } from "@/domain/date-range";
import { hasPermission, loadOrgContext, requireOrgPage } from "@/server/authz";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { PageContainer } from "@/components/ui/layout";
import { HomeCounters, HomeMetrics } from "@/components/workspace/home-sections";
import { CountersSkeleton, MetricsSkeleton } from "@/components/workspace/skeletons";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Home · ${ctx.org.name}` : "Home" };
}

/**
 * Home (L01): greeting, rolling view counters with a link to Live, and
 * "Your metrics" for a UTC date range carried in `from`/`to`. Organic and
 * Ads links keep the selected dates. Every block shows its real state:
 * loading skeleton, confirmed empty, unavailable, or data.
 */
export default async function HomePage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug);
  const sp = await searchParams;
  const range = normalizeRange(first(sp.from), first(sp.to));
  const base = `/home/${ctx.org.slug}`;
  const links = { base, rangeQuery: new URLSearchParams({ from: range.from, to: range.to }).toString() };
  const firstName = ctx.user.firstName.trim();

  return (
    <PageContainer className="pt-8 sm:pt-10">
      <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-ink sm:text-[36px] sm:leading-10">{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</h1>

      <div className="mt-6">
        <Suspense fallback={<CountersSkeleton />}>
          <HomeCounters orgId={ctx.org.id} />
        </Suspense>
        <Link href={`${base}/live`} className="mt-2 inline-flex min-h-11 items-center gap-1 text-[12px] md:min-h-6 font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          See your live views
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold leading-7 text-ink">Your metrics</h2>
          <DateRangePicker value={range} />
        </div>
        {/* Keyed by range so a new range shows the skeleton instead of the previous range's numbers. */}
        <Suspense key={`${range.from}:${range.to}`} fallback={<MetricsSkeleton />}>
          <HomeMetrics orgId={ctx.org.id} range={range} links={links} canManageCampaigns={hasPermission(ctx, "campaign:manage")} />
        </Suspense>
      </div>
    </PageContainer>
  );
}
