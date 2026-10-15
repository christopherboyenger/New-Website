"use client";

import { useId } from "react";
import { BarChart3 } from "lucide-react";
import {
  isRangeMetric,
  organicMetricLabels,
  organicMetrics,
  postModeLabels,
  type OrganicMetric,
  type OrganicState,
} from "@/domain/organic-url-state";
import { cn } from "@/lib/cn";
import type { PostMetricSummary } from "@/server/organic";
import { EM_DASH, formatCount, formatMetric } from "./format";
import { useOrganicNav } from "./use-organic-nav";

function cardValue(metric: OrganicMetric, summary: PostMetricSummary): number | null {
  switch (metric) {
    case "views":
      return summary.range.views;
    case "spend":
      return summary.range.spendCents;
    case "cpm":
      return summary.range.cpmUsd;
    case "posts":
      return summary.range.posts;
    case "creators":
      return summary.range.creators;
    case "engagement":
      return summary.lifetime.engagement;
    default:
      return summary.lifetime[metric];
  }
}

const rangeCaptions: Record<string, string> = {
  views: "Views earned in range",
  spend: "Spend in range",
  cpm: "Weighted CPM in range",
  posts: "Approved posts with views in range",
  creators: "Unique creators with views in range",
};

function caption(metric: OrganicMetric, summary: PostMetricSummary, mode: OrganicState["mode"]): string {
  if (isRangeMetric(metric)) return rangeCaptions[metric];
  const scope = `${formatCount(summary.lifetime.postCount)} approved ${summary.lifetime.postCount === 1 ? "post" : "posts"} ${postModeLabels[mode].label.toLowerCase()}`;
  return `Lifetime total · ${scope}`;
}

/**
 * Four metric cards (L02/L33). Each card's metric is chosen from the ten
 * options; the pressed card is the one charted below. Range metrics come from
 * daily rows inside the UTC range; lifetime counters are the posts' latest
 * observed totals, labelled as such. Unavailable values show "—", never 0.
 */
export function MetricCards({ basePath, state, summary }: { basePath: string; state: OrganicState; summary: PostMetricSummary }) {
  const { navigate, pending } = useOrganicNav(basePath, state);
  const baseId = useId();

  function choose(slot: number, metric: OrganicMetric) {
    const next = [...state.metrics];
    const existing = next.indexOf(metric);
    if (existing >= 0) next[existing] = next[slot];
    next[slot] = metric;
    navigate({ metrics: next, chart: state.chart === state.metrics[slot] ? metric : state.chart });
  }

  return (
    <div className={cn("grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4", pending && "opacity-70 transition-opacity")}>
      {state.metrics.map((metric, slot) => {
        const selectId = `${baseId}-${slot}`;
        const charted = state.chart === metric;
        const awaiting = summary.status === "awaiting_metrics" && isRangeMetric(metric);
        const value = awaiting ? null : cardValue(metric, summary);
        const unavailableReason = awaiting ? "Waiting for the first metrics report" : value === null ? (metric === "cpm" ? "No views in range" : "Not reported yet") : null;
        return (
          <section
            key={slot}
            aria-labelledby={selectId}
            className={cn("relative flex min-h-[128px] flex-col rounded-[12px] border bg-surface p-4 transition-colors", charted ? "border-ink ring-1 ring-ink" : "border-line")}
          >
            <label htmlFor={selectId} className="sr-only">
              Metric card {slot + 1}
            </label>
            <select
              id={selectId}
              value={metric}
              onChange={(e) => choose(slot, e.target.value as OrganicMetric)}
              className="-ml-1 h-8 max-w-full cursor-pointer appearance-auto rounded-[8px] border-0 bg-transparent px-1 text-[13px] font-medium text-ink-2 hover:bg-hover focus-visible:outline-2 max-md:min-h-11"
            >
              {organicMetrics.map((m) => (
                <option key={m} value={m}>
                  {organicMetricLabels[m]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[26px] font-semibold leading-8 text-ink">
              {value === null ? (
                <>
                  <span aria-hidden="true" className="text-muted">
                    {EM_DASH}
                  </span>
                  <span className="sr-only">Unavailable</span>
                </>
              ) : (
                formatMetric(metric, value)
              )}
            </p>
            <p className="mt-1 text-xs text-muted">{unavailableReason ? `${unavailableReason} · ${caption(metric, summary, state.mode)}` : caption(metric, summary, state.mode)}</p>
            <button
              type="button"
              aria-pressed={charted}
              onClick={() => navigate({ chart: metric })}
              className={cn(
                "mt-auto inline-flex min-h-11 items-center gap-1 self-start pt-2 text-xs font-medium md:min-h-7",
                charted ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              <BarChart3 className="size-3" aria-hidden="true" />
              {charted ? "Shown in chart" : "Show in chart"}
              <span className="sr-only">: {organicMetricLabels[metric]}</span>
            </button>
          </section>
        );
      })}
    </div>
  );
}
