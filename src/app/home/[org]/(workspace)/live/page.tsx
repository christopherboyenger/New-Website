import type { Metadata } from "next";
import { loadOrgContext, requireOrgPage } from "@/server/authz";
import { loadRollingCounters } from "@/server/home";
import { AutoRefresh } from "@/components/workspace/auto-refresh";
import { GlobeIllustration } from "@/components/workspace/globe-illustration";
import { RollingViewCounters } from "@/components/workspace/rolling-view-counters";

const REFRESH_MS = 60_000;

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Live · ${ctx.org.name}` : "Live" };
}

/**
 * Live (L09): the two rolling counters with freshness, and a neutral globe.
 * No location marks are drawn because no permitted city-level location
 * source exists yet; activity is never simulated.
 */
export default async function LivePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/live`);
  const counters = await loadRollingCounters(ctx.org.id);

  return (
    <div className="relative flex min-h-[calc(100dvh-10rem)] flex-col overflow-hidden px-4 py-5 sm:px-6">
      <AutoRefresh intervalMs={REFRESH_MS} />
      <div className="relative z-10 max-w-md">
        <RollingViewCounters counters={counters} />
        <h1 className="mt-6 flex items-center gap-2 text-lg font-semibold text-ink">
          <span className="relative inline-flex size-2.5" aria-hidden="true">
            <span className="absolute inline-flex size-full rounded-full bg-success opacity-40 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          Live
        </h1>
        <p className="mt-0.5 text-[13px] text-muted">Views from your creators&apos; cities, last 60 minutes</p>
        <p className="mt-3 text-[13px] leading-5 text-ink-2">
          Creator locations will appear on the globe once location data is available. This workspace has no permitted city-level location source yet, so no places are
          shown.
        </p>
        <p className="mt-2 text-[12px] text-muted">Counters refresh every minute while this page is open.</p>
      </div>
      <div className="pointer-events-none mt-8 flex flex-1 items-center justify-center md:absolute md:inset-0 md:mt-0 md:p-8">
        <GlobeIllustration
          label="Globe of creator locations. No locations are shown because location data isn't available yet."
          className="w-full max-w-[420px] md:h-full md:max-h-[720px] md:w-auto md:max-w-full"
        />
      </div>
    </div>
  );
}
