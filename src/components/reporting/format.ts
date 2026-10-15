/**
 * Display formatting for Organic reporting. Money is integer cents until it
 * is shown; CPM is a weighted USD figure (null → "—", never $0.00); report
 * days are UTC calendar dates.
 */
import { campaignStatusLabels, platformLabels, platforms, type CampaignStatus, type Platform } from "@/domain/campaign";
import { formatCpm, formatPercent } from "@/domain/reporting-math";
import type { OrganicMetric } from "@/domain/organic-url-state";
import { formatCount, formatUsd } from "@/lib/money";

export const EM_DASH = "—";

export function formatSpend(cents: number): string {
  return formatUsd(cents, { decimals: 2 });
}

export function formatAverage(value: number | null): string {
  return value === null ? EM_DASH : formatCount(Math.round(value));
}

export { formatCpm, formatCount };

/** "TikTok, Instagram" — or "All platforms" when the campaign targets every platform. */
export function formatPlatforms(list: Platform[]): string {
  if (list.length === 0 || list.length === platforms.length) return "All platforms";
  return list.map((p) => platformLabels[p]).join(", ");
}

export function campaignStatusLabel(status: CampaignStatus): string {
  return campaignStatusLabels[status];
}

/** Value formatter for a metric card / chart. Spend arrives in cents, engagement as a 0–1 fraction. */
export function formatMetric(metric: OrganicMetric, value: number | null): string {
  if (value === null) return EM_DASH;
  switch (metric) {
    case "spend":
      return formatSpend(value);
    case "cpm":
      return formatCpm(value);
    case "engagement":
      return formatPercent(value, 2);
    default:
      return formatCount(value);
  }
}

/** Compact axis label: "12.4K", "$1.2K", "$2.50", "3.1%". */
export function formatAxis(metric: OrganicMetric, value: number): string {
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  if (metric === "spend") return value >= 100_000 ? `$${compact.format(value / 100)}` : formatUsd(Math.round(value), { decimals: value % 100 === 0 ? 0 : 2 });
  if (metric === "cpm") return `$${value.toFixed(2)}`;
  if (metric === "engagement") return `${(value * 100).toFixed(1)}%`;
  return compact.format(value);
}

const utcDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const utcDayLong = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Oct 4" for a YYYY-MM-DD UTC report day. */
export function formatShortDay(day: string): string {
  return utcDay.format(new Date(`${day}T00:00:00.000Z`));
}

/** "Sat, Oct 4, 2026" for a YYYY-MM-DD UTC report day. */
export function formatLongDay(day: string): string {
  return utcDayLong.format(new Date(`${day}T00:00:00.000Z`));
}

const utcDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Oct 14, 2026" from an ISO instant, in UTC (server-rendered labels such as "Created …"). */
export function formatUtcDate(iso: string): string {
  return utcDate.format(new Date(iso));
}
