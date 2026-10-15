/**
 * Posting-activity heatmap model: the last N weeks of UTC days ending on
 * `endDay`, laid out as columns of 7 consecutive days (oldest column first),
 * plus the text summary that stands in for the graphic for assistive tech.
 */

const DAY_MS = 86_400_000;

function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Every UTC day in the window, oldest first. */
export function activityDays(endDay: string, weeks: number): string[] {
  const total = weeks * 7;
  return Array.from({ length: total }, (_, i) => addDays(endDay, i - (total - 1)));
}

export interface ActivityCell {
  day: string;
  count: number;
  /** 0 = none, 1 = one post, 2 = two posts, 3 = three or more. */
  level: 0 | 1 | 2 | 3;
}

export function activityColumns(activity: Record<string, number>, endDay: string, weeks: number): ActivityCell[][] {
  const days = activityDays(endDay, weeks);
  const columns: ActivityCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    columns.push(
      days.slice(w * 7, w * 7 + 7).map((day) => {
        const count = activity[day] ?? 0;
        return { day, count, level: (count >= 3 ? 3 : count) as ActivityCell["level"] };
      }),
    );
  }
  return columns;
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function formatShortUtcDay(day: string): string {
  return shortDate.format(new Date(`${day}T00:00:00Z`));
}

export function activitySummary(activity: Record<string, number>, endDay: string, weeks: number): string {
  const days = activityDays(endDay, weeks);
  const active = days.filter((d) => (activity[d] ?? 0) > 0);
  if (active.length === 0) return `No posts in the last ${weeks} weeks`;
  const posts = active.reduce((sum, d) => sum + (activity[d] ?? 0), 0);
  const latest = active[active.length - 1];
  return `${posts} ${posts === 1 ? "post" : "posts"} on ${active.length} ${active.length === 1 ? "day" : "days"} in the last ${weeks} weeks, most recently ${formatShortUtcDay(latest)}`;
}
