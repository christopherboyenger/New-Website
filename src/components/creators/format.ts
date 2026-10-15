import { creatorLevelLabels, platformLabels, type CreatorLevel, type Platform } from "@/domain/campaign";
import { formatCount } from "@/lib/money";

export const EM_DASH = "—";

/** A lifetime counter that may never have been observed: null renders as "—", never 0. */
export function formatMetric(value: number | null): string {
  return value === null ? EM_DASH : formatCount(value);
}

export function formatPlatforms(list: Platform[]): string {
  return list.length ? list.map((p) => platformLabels[p]).join(", ") : EM_DASH;
}

export function levelLabel(level: CreatorLevel): string {
  return creatorLevelLabels[level];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

const utcDate = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export function formatUtcDate(iso: string): string {
  return utcDate.format(new Date(iso));
}
