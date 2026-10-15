"use client";

/**
 * STUB with the final public interface. The reporting area replaces the
 * internals (two-month calendar, presets, Apply/Cancel/Reset) without
 * changing `DateRangePickerProps`. Consumers: Home, Organic, Ads.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatRangeLabel, type DateRange } from "@/domain/date-range";

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

export function DateRangePicker({ value, fromParam = "from", toParam = "to", resetParams = ["page"], className }: DateRangePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    params.set(fromParam, draft.from);
    params.set(toParam, draft.to);
    for (const p of resetParams) params.delete(p);
    setOpen(false);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-[13px] text-ink hover:bg-hover">
        <CalendarDays className="size-3.5" aria-hidden="true" />
        {formatRangeLabel(value)}
      </button>
      {open ? (
        <div className="mt-2 flex items-end gap-2 rounded-[10px] border border-line bg-surface p-3 shadow-lg">
          <label className="text-xs text-muted">
            From (UTC)
            <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="mt-1 block rounded border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <label className="text-xs text-muted">
            To (UTC)
            <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="mt-1 block rounded border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <button type="button" onClick={apply} className="h-8 rounded-[8px] bg-ink px-3 text-[13px] text-white">
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}
