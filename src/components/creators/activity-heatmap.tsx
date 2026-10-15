import { cn } from "@/lib/cn";
import { activityColumns, activitySummary, formatShortUtcDay } from "./activity";

const levelClass = ["bg-selected", "bg-ink/30", "bg-ink/60", "bg-ink"] as const;

/**
 * Compact per-day heatmap (columns = weeks, rows = consecutive days). The
 * graphic is decorative for assistive tech; the text summary carries the
 * information, and each cell has a tooltip for pointer users.
 */
export function ActivityHeatmap({ activity, endDay, weeks }: { activity: Record<string, number>; endDay: string; weeks: number }) {
  const summary = activitySummary(activity, endDay, weeks);
  const columns = activityColumns(activity, endDay, weeks);
  return (
    <div className="flex items-center" title={summary}>
      <div className="flex gap-[2px]" aria-hidden="true">
        {columns.map((column) => (
          <div key={column[0].day} className="flex flex-col gap-[2px]">
            {column.map((cell) => (
              <span
                key={cell.day}
                title={`${formatShortUtcDay(cell.day)}: ${cell.count} ${cell.count === 1 ? "post" : "posts"}`}
                className={cn("block size-[5px] rounded-[1px]", levelClass[cell.level])}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">{summary}</span>
    </div>
  );
}
