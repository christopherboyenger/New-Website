"use client";

/**
 * Shared UTC date range picker (L36). Consumers: Home, Organic, Ads.
 *
 * The trigger shows the committed range from the URL. The popover edits a
 * local draft — presets, a two-month calendar (one month under 640px) and
 * "Reset to Last 30 Days" only change the draft; Apply commits it to the URL
 * (push, so Back/Forward restore), Cancel / Escape / an outside click discard
 * it. Report days are UTC calendar dates, at most 366 days, never after today.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent } from "react";
import { CalendarDays, ChevronDown, Globe } from "lucide-react";
import {
  datePresetLabels,
  datePresets,
  dayToDate,
  DEFAULT_PRESET,
  formatRangeLabel,
  matchPreset,
  presetRange,
  todayUtc,
  type DatePreset,
  type DateRange,
} from "@/domain/date-range";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { addMonths, addMonthsToDay, isSelectable, monthOf, rangeFrom, selectedDaysLabel, windowFor } from "./calendar";
import { RangeCalendar } from "./range-calendar";

export interface DateRangePickerProps {
  /** Current committed range (already normalized by the server page). */
  value: DateRange;
  /** Query parameter names written on Apply. */
  fromParam?: string;
  toParam?: string;
  /** Extra query params removed on Apply (e.g. "page"). */
  resetParams?: string[];
  className?: string;
}

interface Session {
  today: string;
  draft: DateRange;
  /** First end picked; the next pick completes the range. */
  anchor: string | null;
  hover: string | null;
  focused: string;
  firstMonth: string;
}

const WIDE_QUERY = "(min-width: 640px)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Two months side by side on wide screens, one on phones. */
function useMonthCount(): number {
  return useSyncExternalStore(
    subscribeWide,
    () => (window.matchMedia(WIDE_QUERY).matches ? 2 : 1),
    () => 2,
  );
}

const GUTTER = 16;

export function DateRangePicker({ value, fromParam = "from", toParam = "to", resetParams = ["page"], className }: DateRangePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [session, setSession] = useState<Session | null>(null);
  const monthCount = useMonthCount();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusDayRequested = useRef(false);
  const panelId = useId();
  const quickId = useId();
  const open = session !== null;

  const close = (returnFocus: boolean) => {
    setSession(null);
    if (returnFocus) triggerRef.current?.focus();
  };

  function openPicker() {
    const today = todayUtc();
    const focused = value.to > today ? today : value.to;
    focusDayRequested.current = true;
    setSession({ today, draft: value, anchor: null, hover: null, focused, firstMonth: addMonths(monthOf(focused), -(monthCount - 1)) });
  }

  // Discard on a click outside the picker.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setSession(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Move focus into the grid on open and after keyboard moves.
  useEffect(() => {
    if (!session || !focusDayRequested.current) return;
    focusDayRequested.current = false;
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-day="${session.focused}"]`)?.focus();
  }, [session]);

  // Keep the panel inside the viewport: right-aligned to the trigger when it fits, shifted otherwise.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const wrapper = wrapperRef.current;
      const panel = panelRef.current;
      if (!wrapper || !panel) return;
      const rect = wrapper.getBoundingClientRect();
      const width = panel.offsetWidth;
      const viewport = document.documentElement.clientWidth;
      const left = Math.max(GUTTER - rect.left, Math.min(rect.width - width, viewport - GUTTER - width - rect.left));
      panel.style.left = `${left}px`;
      panel.style.visibility = "visible";
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, monthCount]);

  function update(patch: Partial<Session> | ((s: Session) => Partial<Session>)) {
    setSession((s) => (s ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s));
  }

  function setRange(range: DateRange) {
    update((s) => ({ draft: range, anchor: null, hover: null, focused: range.to, firstMonth: windowFor(s.firstMonth, monthCount, range.to) }));
  }

  function choosePreset(preset: DatePreset) {
    if (session) setRange(presetRange(preset, dayToDate(session.today)));
  }

  function pick(day: string) {
    update((s) => {
      if (!isSelectable(day, s.today, s.anchor)) return {};
      if (s.anchor === null) return { anchor: day, draft: { from: day, to: day }, focused: day, hover: null };
      return { anchor: null, draft: rangeFrom(s.anchor, day), focused: day, hover: null };
    });
  }

  function focusDay(day: string) {
    focusDayRequested.current = true;
    update((s) => ({ focused: day, hover: null, firstMonth: windowFor(s.firstMonth, monthCount, day) }));
  }

  function shiftMonth(n: number) {
    update((s) => {
      const firstMonth = addMonths(windowFor(s.firstMonth, monthCount, s.focused), n);
      const focused = addMonthsToDay(s.focused, n);
      return { firstMonth, focused: windowFor(firstMonth, monthCount, focused) === firstMonth ? focused : `${firstMonth}-01` };
    });
  }

  function apply() {
    if (!session) return;
    const next = session.draft;
    close(true);
    if (next.from === value.from && next.to === value.to) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(fromParam, next.from);
    params.set(toParam, next.to);
    for (const p of resetParams) params.delete(p);
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close(true);
    }
  }

  // Derived view of the open session.
  let months: string[] = [];
  let shown: DateRange = value;
  let activePreset: DatePreset | null = null;
  let canGoNext = false;
  if (session) {
    const first = windowFor(session.firstMonth, monthCount, session.focused);
    months = Array.from({ length: monthCount }, (_, i) => addMonths(first, i));
    const previewEnd = session.hover ?? session.focused;
    shown = session.anchor ? rangeFrom(session.anchor, isSelectable(previewEnd, session.today, session.anchor) ? previewEnd : session.anchor) : session.draft;
    activePreset = session.anchor ? null : matchPreset(session.draft, dayToDate(session.today));
    canGoNext = months[months.length - 1] < monthOf(session.today);
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-busy={pending || undefined}
        onClick={() => (open ? close(false) : openPicker())}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) close(false);
        }}
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-[13px] text-ink hover:bg-hover focus-visible:outline-2 max-md:min-h-11",
          open && "border-line-strong bg-hover",
          pending && "opacity-70",
        )}
      >
        <CalendarDays className="size-3.5 text-ink-2" aria-hidden="true" />
        <span className="sr-only">Date range (UTC): </span>
        <span className="tabular-nums">{formatRangeLabel(value)}</span>
        <ChevronDown className={cn("size-3.5 text-muted transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
      </button>

      {session ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Choose a date range"
          onKeyDown={onPanelKeyDown}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && !wrapperRef.current?.contains(next)) setSession(null);
          }}
          style={{ visibility: "hidden" }}
          className="absolute top-full z-40 mt-2 w-[calc(100vw-2rem)] max-w-[24rem] rounded-[12px] border border-line bg-surface text-ink shadow-lg sm:w-max sm:max-w-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-xs">
            <p className="inline-flex items-center gap-1.5 text-muted">
              <Globe className="size-3.5" aria-hidden="true" />
              All times in UTC
            </p>
            <p className="font-medium tabular-nums text-ink" aria-live="polite">
              {selectedDaysLabel(shown)}
              {session.anchor ? <span className="font-normal text-muted"> · pick an end date</span> : null}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row">
            <div className="border-b border-line p-3 sm:w-44 sm:border-b-0 sm:border-r">
              <p id={quickId} className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                Quick select
              </p>
              <ul aria-labelledby={quickId} className="grid grid-cols-2 gap-1 sm:grid-cols-1">
                {datePresets.map((preset) => (
                  <li key={preset}>
                    <button
                      type="button"
                      aria-pressed={activePreset === preset}
                      onClick={() => choosePreset(preset)}
                      className={cn(
                        "flex min-h-11 w-full items-center rounded-[8px] px-2 text-left text-[13px] focus-visible:outline-2 sm:min-h-8",
                        activePreset === preset ? "bg-selected font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                      )}
                    >
                      {datePresetLabels[preset]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <RangeCalendar
              months={months}
              range={shown}
              anchor={session.anchor}
              focusedDay={session.focused}
              today={session.today}
              canGoNext={canGoNext}
              onPick={pick}
              onFocusDay={focusDay}
              onHover={(day) => update({ hover: day })}
              onPrevMonth={() => shiftMonth(-1)}
              onNextMonth={() => shiftMonth(1)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-3 sm:px-4">
            <Button variant="ghost" size="sm" onClick={() => setRange(presetRange(DEFAULT_PRESET, dayToDate(session.today)))} className="max-md:min-h-11">
              Reset to {datePresetLabels[DEFAULT_PRESET]}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => close(true)} className="max-md:min-h-11">
                Cancel
              </Button>
              <Button size="sm" onClick={apply} className="max-md:min-h-11">
                Apply
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
