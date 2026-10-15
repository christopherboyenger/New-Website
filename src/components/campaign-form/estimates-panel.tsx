"use client";

import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/button";
import { InlineAlert, NotConfiguredNotice } from "@/components/ui/feedback";
import { formatCompact, formatUsd } from "@/lib/money";
import { forecastReasonText, weeklyAverageCents } from "./model";
import type { ReachEstimate } from "./use-reach-estimate";

/**
 * Right-hand Estimates panel. Shows the forecast service's result exactly:
 * while no model is configured that is "Reach estimate unavailable" with the
 * reason — never placeholder numbers or meters (DEC-008). The budget block
 * only restates the user's own input (daily target and its 7-day average).
 */
export function EstimatesPanel({ estimate, dailyBudgetCents, footer }: { estimate: ReachEstimate; dailyBudgetCents: number | null; footer?: ReactNode }) {
  const pending = estimate.status === "pending";
  return (
    <section aria-labelledby="estimates-title" className="rounded-[12px] border border-line bg-surface">
      <h2 id="estimates-title" className="px-5 pt-4 text-[15px] font-semibold text-ink">
        Estimates
      </h2>
      <div className="flex flex-col gap-5 px-5 py-4">
        <div aria-busy={pending || undefined} className="min-h-[84px]">
          <ForecastBody estimate={estimate} />
        </div>
        <div>
          <h3 className="text-[13px] font-medium text-ink-2">Your budget</h3>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted">Daily average</dt>
            <dd className="text-right font-medium text-ink tabular-nums">{dailyBudgetCents !== null ? formatUsd(dailyBudgetCents) : "Not set"}</dd>
            <dt className="text-muted">Weekly average</dt>
            <dd className="text-right font-medium text-ink tabular-nums">{dailyBudgetCents !== null ? formatUsd(weeklyAverageCents(dailyBudgetCents)) : "Not set"}</dd>
          </dl>
        </div>
      </div>
      {footer ? <div className="border-t border-line px-5 py-4">{footer}</div> : null}
    </section>
  );
}

function ForecastBody({ estimate }: { estimate: ReachEstimate }) {
  switch (estimate.status) {
    case "pending":
      return (
        <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-line-strong bg-canvas px-3.5 py-3 text-sm text-muted">
          <Spinner className="size-4 shrink-0" />
          Updating the estimate for your latest settings…
        </div>
      );
    case "incomplete":
      return <NotConfiguredNotice title="Reach estimate unavailable">Enter a valid daily budget and age range to estimate reach.</NotConfiguredNotice>;
    case "error":
      return (
        <InlineAlert tone="warning" title="Estimate couldn't load">
          {estimate.message}
        </InlineAlert>
      );
    case "ready": {
      const forecast = estimate.forecast;
      if (forecast.status === "unavailable") {
        return <NotConfiguredNotice title="Reach estimate unavailable">{forecastReasonText(forecast.reason)}</NotConfiguredNotice>;
      }
      const range = (r: { low: number; high: number }) => `${formatCompact(r.low)}–${formatCompact(r.high)}`;
      return (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted">Estimated monthly views</dt>
            <dd className="text-right font-medium text-ink tabular-nums">{range(forecast.monthlyViews)}</dd>
            <dt className="text-muted">Creators posting about you</dt>
            <dd className="text-right font-medium text-ink tabular-nums">{range(forecast.creators)}</dd>
            <dt className="text-muted">Estimated monthly posts</dt>
            <dd className="text-right font-medium text-ink tabular-nums">{range(forecast.monthlyPosts)}</dd>
          </dl>
          <p className="text-xs text-muted">
            Estimate over {forecast.periodDays} days, not a guarantee. Model {forecast.modelVersion}, generated{" "}
            {new Date(forecast.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.
          </p>
          {forecast.assumptions.length ? (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer text-ink-2">Assumptions</summary>
              <ul className="mt-1 list-disc pl-4">
                {forecast.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      );
    }
  }
}
