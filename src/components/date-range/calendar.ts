/**
 * Pure calendar math for the UTC date range picker. Days are YYYY-MM-DD UTC
 * calendar dates (src/domain/date-range.ts); months are "YYYY-MM".
 */
import { addDays, dayToDate, MAX_RANGE_DAYS, rangeLengthDays, toDay, type DateRange } from "@/domain/date-range";

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return toDay(d).slice(0, 7);
}

/** Same day-of-month n months later, clamped to the target month's length (Jan 31 + 1 month → Feb 28/29). */
export function addMonthsToDay(day: string, n: number): string {
  const target = addMonths(monthOf(day), n);
  const [y, m] = target.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${target}-${String(Math.min(Number(day.slice(8, 10)), lastDay)).padStart(2, "0")}`;
}

/** Weeks (Sunday first) of a month; days outside the month are null. */
export function monthWeeks(month: string): Array<Array<string | null>> {
  const first = `${month}-01`;
  const startDow = dayToDate(first).getUTCDay();
  const weeks: Array<Array<string | null>> = [];
  let week: Array<string | null> = Array.from({ length: startDow }, () => null);
  for (let d = first; monthOf(d) === month; d = addDays(d, 1)) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => null)]);
  return weeks;
}

export function dayOfWeek(day: string): number {
  return dayToDate(day).getUTCDay();
}

/** Ordered range from two picked days. */
export function rangeFrom(a: string, b: string): DateRange {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/**
 * Whether `day` can be picked: never after today (UTC), and — while the first
 * end of a range is chosen — never more than MAX_RANGE_DAYS from it.
 */
export function isSelectable(day: string, today: string, anchor: string | null): boolean {
  if (day > today) return false;
  if (anchor && rangeLengthDays(rangeFrom(anchor, day)) > MAX_RANGE_DAYS) return false;
  return true;
}

/** Keyboard movement inside the calendar grid (WAI-ARIA date picker pattern). */
export function moveFocus(day: string, key: string, shiftKey: boolean): string | null {
  switch (key) {
    case "ArrowLeft":
      return addDays(day, -1);
    case "ArrowRight":
      return addDays(day, 1);
    case "ArrowUp":
      return addDays(day, -7);
    case "ArrowDown":
      return addDays(day, 7);
    case "Home":
      return addDays(day, -dayOfWeek(day));
    case "End":
      return addDays(day, 6 - dayOfWeek(day));
    case "PageUp":
      return addMonthsToDay(day, shiftKey ? -12 : -1);
    case "PageDown":
      return addMonthsToDay(day, shiftKey ? 12 : 1);
    default:
      return null;
  }
}

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "September 2026" for "2026-09". */
export function monthLabel(month: string): string {
  return monthFormat.format(dayToDate(`${month}-01`));
}

/** "Wednesday, October 14, 2026" — the accessible name of a calendar day. */
export function dayLabel(day: string): string {
  return dayFormat.format(dayToDate(day));
}

export const weekdays = [
  { short: "Su", long: "Sunday" },
  { short: "Mo", long: "Monday" },
  { short: "Tu", long: "Tuesday" },
  { short: "We", long: "Wednesday" },
  { short: "Th", long: "Thursday" },
  { short: "Fr", long: "Friday" },
  { short: "Sa", long: "Saturday" },
] as const;

/** "1 day selected" / "30 days selected". */
export function selectedDaysLabel(range: DateRange): string {
  const n = rangeLengthDays(range);
  return `${n} ${n === 1 ? "day" : "days"} selected`;
}

/** First visible month so that `day` is inside a window of `count` months starting there (moving as little as possible). */
export function windowFor(firstMonth: string, count: number, day: string): string {
  const month = monthOf(day);
  if (month < firstMonth) return month;
  const last = addMonths(firstMonth, count - 1);
  if (month > last) return addMonths(month, -(count - 1));
  return firstMonth;
}
