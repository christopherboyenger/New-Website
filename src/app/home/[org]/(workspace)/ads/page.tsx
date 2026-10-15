import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { normalizeRange } from "@/domain/date-range";
import { hasPermission, loadOrgContext, requireOrgPage } from "@/server/authz";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { AdsSection, AdsSectionSkeleton } from "@/components/ads/ads-sections";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/layout";
import { LinkTabs } from "@/components/ui/tabs";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Ads · ${ctx.org.name}` : "Ads" };
}

/**
 * Ads (L08) and Submissions (L37). URL state: `view=submissions` (anything
 * else is All ads), `from`/`to` UTC days, `page`. Malformed values fall back
 * to defaults. No performance numbers are shown: this deployment imports none.
 */
export default async function AdsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/ads`);
  const sp = await searchParams;
  const view = first(sp.view) === "submissions" ? "submissions" : "all";
  const range = normalizeRange(first(sp.from), first(sp.to));
  const rawPage = Number(first(sp.page));
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 10_000 ? rawPage : 1;
  const base = `/home/${ctx.org.slug}/ads`;
  const canLaunch = hasPermission(ctx, "ads:launch");

  const href = (next: { view?: string; page?: number }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    if (v === "submissions") q.set("view", "submissions");
    q.set("from", range.from);
    q.set("to", range.to);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    return `${base}?${q.toString()}`;
  };

  return (
    <PageContainer className="pt-8 sm:pt-10">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-xl font-semibold leading-7 text-ink">Ads</h1>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <DateRangePicker value={range} />
          {canLaunch ? (
            <ButtonLink href={`${base}/new?pick=1`} size="sm" className="max-md:min-h-11">
              <Plus className="size-3.5" aria-hidden="true" />
              Create ads
            </ButtonLink>
          ) : (
            <span className="flex items-center gap-2">
              <Button size="sm" disabled aria-describedby="create-ads-reason">
                <Plus className="size-3.5" aria-hidden="true" />
                Create ads
              </Button>
              <span id="create-ads-reason" className="max-w-[180px] text-xs leading-4 text-muted">
                Only workspace owners can create ads.
              </span>
            </span>
          )}
        </div>
      </header>
      <LinkTabs
        label="Ads view"
        activeKey={view}
        className="mb-5"
        tabs={[
          { key: "all", label: "All ads", href: href({ view: "all" }) },
          { key: "submissions", label: "Submissions", href: href({ view: "submissions" }) },
        ]}
      />
      <Suspense key={`${view}:${range.from}:${range.to}:${page}`} fallback={<AdsSectionSkeleton />}>
        <AdsSection slug={ctx.org.slug} view={view} range={range} page={page} pageHref={(p) => href({ page: p })} />
      </Suspense>
    </PageContainer>
  );
}
