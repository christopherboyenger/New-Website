import Link from "next/link";
import { X } from "lucide-react";
import { organicHref, organicTabLabels, organicTabs, type OrganicState } from "@/domain/organic-url-state";
import { LinkTabs } from "@/components/ui/tabs";
import type { FilterLabel } from "@/server/organic";

/**
 * Campaigns / Playbooks / Posts tabs with counts (L02–L04). The Campaigns tab
 * clears campaign/playbook filters; Playbooks keeps the campaign filter
 * (drilldown); Posts keeps every filter. On the Playbooks tab an active
 * campaign filter is shown as a clearable chip (L04).
 */
export function OrganicTabs({
  basePath,
  state,
  counts,
  campaignFilter,
}: {
  basePath: string;
  state: OrganicState;
  counts: { campaigns: number; playbooks: number; posts: number };
  campaignFilter: FilterLabel | null;
}) {
  const patches: Record<(typeof organicTabs)[number], Partial<OrganicState>> = {
    campaigns: { tab: "campaigns", campaign: null, playbook: null },
    playbooks: { tab: "playbooks", playbook: null },
    posts: { tab: "posts" },
  };
  return (
    <div className="mb-5">
      <LinkTabs
        label="Organic views"
        activeKey={state.tab}
        className="overflow-x-auto"
        tabs={organicTabs.map((tab) => ({ key: tab, label: organicTabLabels[tab], count: counts[tab], href: organicHref(basePath, state, patches[tab]) }))}
      />
      {state.tab === "playbooks" && campaignFilter ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Campaign</span>
          <span className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-ink md:min-h-8">
            <span className="max-w-[240px] truncate">{campaignFilter.label}</span>
            <Link
              href={organicHref(basePath, state, { campaign: null })}
              scroll={false}
              aria-label={`Clear ${campaignFilter.label} filter`}
              className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink md:size-6"
            >
              <X className="size-3.5" aria-hidden="true" />
            </Link>
          </span>
        </div>
      ) : null}
    </div>
  );
}
