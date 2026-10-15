import { formatCount } from "@/lib/money";
import { formatShortDay } from "./format";

const WIDTH = 320;
const HEIGHT = 72;
const PAD_X = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;

/**
 * Small daily trend for one series. Text alternative: the SVG carries a
 * summary (range, total, peak) and the same summary is visible as a caption;
 * each day has a native hover tooltip. The full chart and table live in Organic.
 */
export function ViewsTrend({ series, total }: { series: Array<{ day: string; views: number }>; total: number }) {
  if (series.length === 0) return null;
  const max = Math.max(...series.map((p) => p.views), 1);
  const peak = series.reduce((best, p) => (p.views > best.views ? p : best), series[0]);
  const step = series.length > 1 ? (WIDTH - PAD_X * 2) / (series.length - 1) : 0;
  const x = (i: number) => (series.length > 1 ? PAD_X + i * step : WIDTH / 2);
  const y = (v: number) => PAD_TOP + (1 - v / max) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
  const baseline = HEIGHT - PAD_BOTTOM;
  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`;
  const last = series[series.length - 1];
  const summary = `Daily organic views, ${formatShortDay(series[0].day)} to ${formatShortDay(last.day)} (UTC): ${formatCount(total)} in total, highest on ${formatShortDay(peak.day)} with ${formatCount(peak.views)}.`;
  const hitWidth = series.length > 1 ? step : WIDTH;

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-[72px] w-full overflow-visible" role="img" aria-label={summary}>
        <line x1={0} x2={WIDTH} y1={baseline} y2={baseline} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={area} fill="var(--color-ink-2)" fillOpacity={0.1} />
        <path d={line} fill="none" stroke="var(--color-ink-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {series.map((p, i) => (
          <rect key={p.day} x={x(i) - hitWidth / 2} y={0} width={hitWidth} height={HEIGHT} fill="transparent">
            <title>{`${formatShortDay(p.day)}: ${formatCount(p.views)} views`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="mt-1.5 flex justify-between gap-3 text-[12px] text-muted">
        <span>
          Peak {formatCount(peak.views)} on {formatShortDay(peak.day)}
        </span>
        <span>UTC days</span>
      </figcaption>
    </figure>
  );
}
