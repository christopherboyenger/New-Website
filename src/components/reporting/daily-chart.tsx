"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { comparisonLabels, organicMetricLabels, rangeMetrics, type OrganicMetric } from "@/domain/organic-url-state";
import { cn } from "@/lib/cn";
import type { DailyChartData } from "@/server/organic";
import { formatAxis, formatLongDay, formatMetric, formatShortDay } from "./format";

/**
 * Categorical slots for comparison lines (validated with the dataviz palette
 * checker against the white surface: adjacent CVD ΔE ≥ 9.1; three slots are
 * below 3:1 contrast, so a legend AND the data table are always provided).
 * A single series uses the dashboard ink.
 */
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const SINGLE_COLOR = "var(--color-ink-2)";

const W = 1000;
const H = 220;
const TOP = 10;
const BOTTOM = 8;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * exp;
}

export type ChartState =
  | { kind: "data"; data: DailyChartData }
  | { kind: "awaiting" }
  | { kind: "lifetime"; metric: OrganicMetric };

/**
 * Daily chart for the charted metric card (L02 "Daily Total Views. Left and
 * right arrow keys move between days."). Pointer hover and arrow keys move a
 * crosshair between UTC days; a polite live region reads the values. The same
 * numbers are available in the data table below the chart.
 */
export function DailyChart({ state }: { state: ChartState }) {
  if (state.kind === "lifetime") {
    return (
      <ChartMessage
        title={`${organicMetricLabels[state.metric]} has no daily series`}
        body={`${organicMetricLabels[state.metric]} is a lifetime total per post, so it can't be split by day. Chart ${rangeMetrics.map((m) => organicMetricLabels[m]).join(", ")} instead.`}
      />
    );
  }
  if (state.kind === "awaiting") {
    return <ChartMessage title="Daily metrics aren't available yet" body="No metrics source has reported views for your posts yet. The chart fills in once reporting starts." />;
  }
  return <SeriesChart data={state.data} />;
}

function ChartMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line bg-canvas/50 px-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-md text-[13px] text-muted">{body}</p>
    </div>
  );
}

function SeriesChart({ data }: { data: DailyChartData }) {
  const metric = data.metric;
  const label = organicMetricLabels[metric];
  const days = data.series[0]?.points.map((p) => p.day) ?? [];
  const multi = data.series.length > 1 || data.comparison !== "none";
  const hasValues = data.series.some((s) => s.points.some((p) => (p.value ?? 0) > 0));
  const statusId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);

  const max = useMemo(() => niceMax(Math.max(0, ...data.series.flatMap((s) => s.points.map((p) => p.value ?? 0)))), [data]);
  const x = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * W : W / 2);
  const y = (v: number) => TOP + (1 - v / max) * (H - TOP - BOTTOM);
  const pct = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * 100 : 50);

  if (!days.length || !hasValues) {
    const empty = data.comparison !== "none" && data.series.length === 0;
    return (
      <ChartMessage
        title={`No ${label.toLowerCase()} in this period`}
        body={empty ? "None of the compared groups had views or spend in the selected range." : "Approved posts haven't earned in the selected range yet. Try a longer range or different filters."}
      />
    );
  }

  const paths = data.series.map((s) => {
    let d = "";
    let drawing = false;
    s.points.forEach((p, i) => {
      if (p.value === null) {
        drawing = false;
        return;
      }
      d += `${drawing ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)} `;
      drawing = true;
    });
    return d.trim();
  });

  function move(next: number) {
    setIndex(Math.max(0, Math.min(days.length - 1, next)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = index ?? days.length - 1;
    const keys: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, ArrowUp: current + 1, ArrowDown: current - 1, PageUp: current - 7, PageDown: current + 7, Home: 0, End: days.length - 1 };
    if (event.key in keys) {
      event.preventDefault();
      move(keys[event.key]);
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    move(Math.round(((event.clientX - rect.left) / rect.width) * (days.length - 1)));
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const xLabels = days.length > 1 ? [0, Math.floor((days.length - 1) / 2), days.length - 1] : [0];
  const active = index !== null ? index : null;
  const readout =
    active === null
      ? ""
      : `${formatLongDay(days[active])}: ${data.series.map((s) => `${multi ? `${s.label} ` : ""}${formatMetric(metric, s.points[active].value)}`).join(", ")}`;
  const colorFor = (i: number) => (multi ? SERIES_COLORS[i % SERIES_COLORS.length] : SINGLE_COLOR);

  return (
    <figure className="m-0">
      {multi ? (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-2" aria-label="Legend">
          {data.series.map((s, i) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: colorFor(i) }} />
              <span className="max-w-[180px] truncate">{s.label}</span>
              <span className="tabular-nums text-muted">{formatMetric(metric, s.total)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <div className="relative w-12 shrink-0 text-right text-[11px] tabular-nums text-muted" aria-hidden="true" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
              {formatAxis(metric, t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={plotRef}
            role="application"
            tabIndex={0}
            aria-roledescription="chart"
            aria-label={`Daily ${label}${multi ? ` by ${comparisonLabels[data.comparison].toLowerCase()}` : ""}. Left and right arrow keys move between days.`}
            aria-describedby={statusId}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true);
              if (index === null) setIndex(days.length - 1);
            }}
            onBlur={() => {
              setFocused(false);
              setIndex(null);
            }}
            onPointerMove={onPointerMove}
            onPointerLeave={() => {
              if (!focused) setIndex(null);
            }}
            className="relative cursor-crosshair rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-4"
            style={{ height: H }}
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
              {ticks.map((t) => (
                <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-line-strong)" : "var(--color-line)"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {!multi && paths[0] ? <path d={`${paths[0]} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={SINGLE_COLOR} fillOpacity={0.08} stroke="none" /> : null}
              {paths.map((d, i) => (
                <path key={data.series[i].key} d={d} fill="none" stroke={colorFor(i)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ))}
              {active !== null ? <line x1={x(active)} x2={x(active)} y1={0} y2={H} stroke="var(--color-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
            </svg>
            {active !== null
              ? data.series.map((s, i) =>
                  s.points[active].value === null ? null : (
                    <span
                      key={s.key}
                      aria-hidden="true"
                      className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                      style={{ left: `${pct(active)}%`, top: y(s.points[active].value ?? 0), background: colorFor(i) }}
                    />
                  ),
                )
              : null}
            {active !== null ? (
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute top-0 z-10 min-w-[150px] max-w-[240px] rounded-[8px] border border-line bg-surface px-2.5 py-2 text-xs shadow-md",
                  pct(active) > 60 ? "-translate-x-[calc(100%+10px)]" : "translate-x-[10px]",
                )}
                style={{ left: `${pct(active)}%` }}
              >
                <p className="mb-1 font-medium text-muted">{formatLongDay(days[active])}</p>
                {data.series.map((s, i) => (
                  <p key={s.key} className="flex items-center gap-1.5">
                    {multi ? <span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ background: colorFor(i) }} /> : null}
                    <span className="font-semibold tabular-nums text-ink">{formatMetric(metric, s.points[active].value)}</span>
                    {multi ? <span className="truncate text-muted">{s.label}</span> : null}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted" aria-hidden="true">
            {xLabels.map((i) => (
              <span key={i}>{formatShortDay(days[i])}</span>
            ))}
          </div>
        </div>
      </div>
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {readout}
      </p>
      <figcaption className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>
          Daily {label.toLowerCase()} · UTC days
          {data.groupCount > data.series.length && multi ? ` · showing the ${data.series.length} largest of ${data.groupCount} ${comparisonLabels[data.comparison].toLowerCase()} groups` : ""}
        </span>
        {metric === "cpm" ? <span>Days without views have no CPM.</span> : null}
      </figcaption>
      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-ink-2 hover:text-ink md:min-h-6">Show data table</summary>
        <div className="mt-2 max-h-80 overflow-auto rounded-[8px] border border-line" role="region" aria-label={`Daily ${label} table`} tabIndex={0}>
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">Daily {label}, UTC days</caption>
            <thead className="sticky top-0 bg-canvas text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Day (UTC)
                </th>
                {data.series.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {multi ? s.label : label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day, i) => (
                <tr key={day} className="border-t border-line">
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 font-normal text-ink-2">
                    {formatLongDay(day)}
                  </th>
                  {data.series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">
                      {formatMetric(metric, s.points[i].value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line-strong">
              <tr>
                <th scope="row" className="px-3 py-1.5 text-left font-medium">
                  Range total
                </th>
                {data.series.map((s) => (
                  <td key={s.key} className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {formatMetric(metric, s.total)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </figure>
  );
}

