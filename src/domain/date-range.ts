/**
 * Reporting days are UTC calendar dates (YYYY-MM-DD), inclusive on both ends
 * ("All times in UTC", L36). Never derive report days from the viewer's
 * local timezone; only timestamps (e.g. posted_at) are rendered locally.
 */

export interface DateRange {
  from: string;
  to: string;
}

export const MAX_RANGE_DAYS = 366;

export const datePresets = [
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "this_month",
  "last_month",
  "year_to_date",
] as const;
export type DatePreset = (typeof datePresets)[number];

export const datePresetLabels: Record<DatePreset, string> = {
  last_7_days: "Last 7 Days",
  last_30_days: "Last 30 Days",
  last_90_days: "Last 90 Days",
  this_month: "This Month",
  last_month: "Last Month",
  year_to_date: "Year to Date",
};

export const DEFAULT_PRESET: DatePreset = "last_30_days";

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict YYYY-MM-DD validation (rejects 2026-02-30). */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function todayUtc(now: Date = new Date()): string {
  return toDay(now);
}

export function addDays(day: string, n: number): string {
  const d = dayToDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

/** Inclusive day count. */
export function rangeLengthDays(range: DateRange): number {
  return Math.round((dayToDate(range.to).getTime() - dayToDate(range.from).getTime()) / 86_400_000) + 1;
}

export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function presetRange(preset: DatePreset, now: Date = new Date()): DateRange {
  const today = todayUtc(now);
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "last_7_days":
      return { from: addDays(today, -6), to: today };
    case "last_30_days":
      return { from: addDays(today, -29), to: today };
    case "last_90_days":
      return { from: addDays(today, -89), to: today };
    case "this_month":
      return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
    case "last_month": {
      const firstThis = dayToDate(`${y}-${String(m).padStart(2, "0")}-01`);
      const lastPrev = addDays(toDay(firstThis), -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    case "year_to_date":
      return { from: `${y}-01-01`, to: today };
  }
}

export type RangeValidation = { ok: true; range: DateRange } | { ok: false; error: string };

/** Strict validation for API input. */
export function validateRange(from: unknown, to: unknown): RangeValidation {
  if (!isValidDay(from) || !isValidDay(to)) return { ok: false, error: "start_date and end_date must be YYYY-MM-DD." };
  if (from > to) return { ok: false, error: "start_date must be on or before end_date." };
  const range = { from, to };
  if (rangeLengthDays(range) > MAX_RANGE_DAYS) return { ok: false, error: `Date range cannot exceed ${MAX_RANGE_DAYS} days.` };
  return { ok: true, range };
}

/**
 * Lenient normalization for URL state: malformed values fall back to the
 * default preset, reversed bounds are swapped, and over-long ranges are clamped.
 */
export function normalizeRange(from: unknown, to: unknown, now: Date = new Date()): DateRange {
  if (!isValidDay(from) || !isValidDay(to)) return presetRange(DEFAULT_PRESET, now);
  let range = from <= to ? { from, to } : { from: to, to: from };
  if (rangeLengthDays(range) > MAX_RANGE_DAYS) range = { from: addDays(range.to, -(MAX_RANGE_DAYS - 1)), to: range.to };
  return range;
}

export function matchPreset(range: DateRange, now: Date = new Date()): DatePreset | null {
  for (const preset of datePresets) {
    const p = presetRange(preset, now);
    if (p.from === range.from && p.to === range.to) return preset;
  }
  return null;
}

const labelFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function formatDay(day: string): string {
  return labelFormat.format(dayToDate(day));
}

/** "Sep 15, 2026 - Oct 14, 2026" */
export function formatRangeLabel(range: DateRange): string {
  return `${formatDay(range.from)} - ${formatDay(range.to)}`;
}
