"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, type DateRange } from "@/domain/date-range";
import { cn } from "@/lib/cn";
import { dayLabel, dayOfWeek, isSelectable, monthLabel, monthWeeks, moveFocus, weekdays } from "./calendar";

export interface RangeCalendarProps {
  /** Visible months ("YYYY-MM"), oldest first: two on wide screens, one on phones. */
  months: string[];
  /** The range drawn as selected (the draft, or the preview while an end is being chosen). */
  range: DateRange;
  /** First picked end while the second is being chosen; limits the span to 366 days. */
  anchor: string | null;
  /** The one day in the tab order (roving tabindex). */
  focusedDay: string;
  /** Today in UTC; later days cannot be picked. */
  today: string;
  canGoNext: boolean;
  onPick: (day: string) => void;
  /** Keyboard moves request focus; hover only previews. */
  onFocusDay: (day: string) => void;
  onHover: (day: string | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

/**
 * Month grids for the date range picker (WAI-ARIA date grid): arrow keys move
 * by day/week, Home/End to the week's ends, PageUp/PageDown by month (with
 * Shift by year), Enter/Space picks. Days are UTC calendar dates.
 */
export function RangeCalendar({ months, range, anchor, focusedDay, today, canGoNext, onPick, onFocusDay, onHover, onPrevMonth, onNextMonth }: RangeCalendarProps) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const next = moveFocus(day, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    onFocusDay(next);
  }

  return (
    <div className="flex flex-col gap-4 p-3 sm:flex-row sm:gap-6 sm:p-4" onMouseLeave={() => onHover(null)}>
      {months.map((month, index) => (
        <MonthGrid
          key={month}
          month={month}
          showPrev={index === 0}
          showNext={index === months.length - 1}
          canGoNext={canGoNext}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
        >
          {(day) => {
            const selectable = isSelectable(day, today, anchor);
            const inRange = day >= range.from && day <= range.to;
            const isStart = day === range.from;
            const isEnd = day === range.to;
            const endpoint = isStart || isEnd;
            const weekday = dayOfWeek(day);
            const lastOfMonth = addDays(day, 1).endsWith("-01");
            const notes = [isStart ? "range start" : null, isEnd ? "range end" : null, day === today ? "today" : null, selectable ? null : "unavailable"].filter(Boolean);
            return (
              <td
                key={day}
                role="gridcell"
                aria-selected={inRange}
                className={cn(
                  "p-0",
                  inRange && "bg-selected",
                  inRange && (isStart || weekday === 0 || day.endsWith("-01")) && "rounded-l-[8px]",
                  inRange && (isEnd || weekday === 6 || lastOfMonth) && "rounded-r-[8px]",
                )}
              >
                <button
                  type="button"
                  data-day={day}
                  tabIndex={day === focusedDay ? 0 : -1}
                  aria-disabled={!selectable || undefined}
                  aria-current={day === today ? "date" : undefined}
                  aria-label={notes.length ? `${dayLabel(day)}, ${notes.join(", ")}` : dayLabel(day)}
                  onClick={() => (selectable ? onPick(day) : undefined)}
                  onKeyDown={(event) => onKeyDown(event, day)}
                  onMouseEnter={() => (anchor ? onHover(day) : undefined)}
                  className={cn(
                    "relative flex size-11 items-center justify-center rounded-[8px] text-[13px] tabular-nums transition-colors sm:size-9",
                    "focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-0",
                    endpoint ? "bg-ink font-medium text-white" : selectable ? "text-ink hover:bg-line-strong/70" : "cursor-not-allowed text-subtle/70",
                    day === today && "after:absolute after:bottom-1 after:size-1 after:rounded-full after:bg-current",
                  )}
                >
                  {Number(day.slice(8, 10))}
                </button>
              </td>
            );
          }}
        </MonthGrid>
      ))}
    </div>
  );
}

const navButton =
  "inline-flex size-11 items-center justify-center rounded-[8px] text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40 sm:size-8";

function MonthGrid({
  month,
  showPrev,
  showNext,
  canGoNext,
  onPrevMonth,
  onNextMonth,
  children,
}: {
  month: string;
  showPrev: boolean;
  showNext: boolean;
  canGoNext: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  children: (day: string) => ReactNode;
}) {
  const headingId = useId();
  return (
    <div className="mx-auto sm:mx-0">
      <div className="mb-2 flex items-center gap-1">
        {showPrev ? (
          <button type="button" onClick={onPrevMonth} aria-label="Go to previous month" className={navButton}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-11 sm:size-8" aria-hidden="true" />
        )}
        <p id={headingId} className="flex-1 text-center text-sm font-medium text-ink" aria-live="polite">
          {monthLabel(month)}
        </p>
        {showNext ? (
          <button type="button" onClick={onNextMonth} disabled={!canGoNext} aria-label="Go to next month" className={navButton}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-11 sm:size-8" aria-hidden="true" />
        )}
      </div>
      <table role="grid" aria-labelledby={headingId} className="border-separate border-spacing-y-0.5">
        <thead>
          <tr>
            {weekdays.map((d) => (
              <th key={d.long} scope="col" abbr={d.long} className="pb-1 text-center text-[11px] font-medium text-muted">
                <span aria-hidden="true">{d.short}</span>
                <span className="sr-only">{d.long}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(month).map((week, i) => (
            <tr key={i}>{week.map((day, j) => (day ? children(day) : <td key={`blank-${j}`} className="p-0" />))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
