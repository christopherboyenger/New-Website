"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { creatorLevelLabels, creatorLevels, platformLabels, platforms } from "@/domain/campaign";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export interface RosterFilterValues {
  tab: string;
  q: string;
  campaign: string;
  level: string;
  platform: string;
  /** Present only when not the default sort. */
  sort: string | null;
  order: string | null;
}

/**
 * Search + Campaign / Creator Level / Platform filters. A real GET form (works
 * without JavaScript); with JavaScript, selects apply immediately and the
 * search applies 350ms after typing stops. Empty values are left out of the
 * URL and any filter change returns to page 1.
 */
export function RosterFilters({ values, campaigns }: { values: RosterFilterValues; campaigns: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function apply() {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function applySoon() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(apply, 350);
  }

  return (
    <form
      ref={formRef}
      method="get"
      action={pathname}
      role="search"
      aria-label="Filter creators"
      aria-busy={pending || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      className={cn("flex flex-wrap items-center gap-2", pending && "opacity-80")}
    >
      {values.tab !== "all" ? <input type="hidden" name="tab" value={values.tab} /> : null}
      {values.sort ? <input type="hidden" name="sort" value={values.sort} /> : null}
      {values.order ? <input type="hidden" name="order" value={values.order} /> : null}
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <label htmlFor="creator-search" className="sr-only">
          Find a creator
        </label>
        <Input
          id="creator-search"
          name="q"
          type="search"
          defaultValue={values.q}
          placeholder="Find a creator..."
          autoComplete="off"
          maxLength={100}
          onChange={applySoon}
          className="pl-8 max-md:h-11"
        />
      </div>
      <FilterSelect id="creator-campaign" name="campaign" label="Campaign" value={values.campaign} onChange={apply}>
        <option value="">All campaigns</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect id="creator-level" name="level" label="Creator Level" value={values.level} onChange={apply}>
        <option value="">All levels</option>
        {creatorLevels.map((level) => (
          <option key={level} value={level}>
            {creatorLevelLabels[level]}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect id="creator-platform" name="platform" label="Platform" value={values.platform} onChange={apply}>
        <option value="">All platforms</option>
        {platforms.map((p) => (
          <option key={p} value={p}>
            {platformLabels[p]}
          </option>
        ))}
      </FilterSelect>
      <noscript>
        <button type="submit" className="h-9 rounded-[8px] border border-line px-3 text-sm">
          Apply
        </button>
      </noscript>
    </form>
  );
}

function FilterSelect({ id, name, label, value, onChange, children }: { id: string; name: string; label: string; value: string; onChange: () => void; children: React.ReactNode }) {
  return (
    <div className="min-w-36 flex-1 sm:flex-none">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select id={id} name={name} defaultValue={value} onChange={onChange} title={label} className="w-full sm:w-44 max-md:h-11">
        {children}
      </Select>
    </div>
  );
}
