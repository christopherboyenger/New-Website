"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, LayoutGrid, ListFilter, Rows3, Search, X } from "lucide-react";
import { platformLabels, platforms, type Platform } from "@/domain/campaign";
import {
  comparisonDimensions,
  comparisonLabels,
  postModeLabels,
  postModes,
  reviewFilterLabels,
  reviewFilters,
  type OrganicState,
  type PostMode,
  type ReviewFilter,
} from "@/domain/organic-url-state";
import { cn } from "@/lib/cn";
import type { ChoiceOption, FilterLabel } from "@/server/organic";
import { usePopover } from "./popover";
import { useOrganicNav } from "./use-organic-nav";

const chip =
  "inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-[13px] text-ink md:min-h-8 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-accent";
const toolButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-[8px] border border-line bg-surface px-3 text-[13px] text-ink hover:bg-hover md:h-8 md:min-h-0 focus-visible:outline-2";

/* ----------------------------------------------------------------------------
 * Comparison (chart) control
 * ------------------------------------------------------------------------- */

export function ComparisonControl({ basePath, state }: { basePath: string; state: OrganicState }) {
  const { navigate } = useOrganicNav(basePath, state);
  return (
    <div role="group" aria-label="Compare the chart by" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[13px] text-muted" aria-hidden="true">
        Compare
      </span>
      {comparisonDimensions.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={state.comparisons === d}
          onClick={() => navigate({ comparisons: d })}
          className={cn(
            "inline-flex min-h-11 items-center rounded-[8px] px-2.5 text-[13px] md:h-7 md:min-h-0 focus-visible:outline-2",
            state.comparisons === d ? "bg-ink font-medium text-white" : "text-ink-2 hover:bg-hover",
          )}
        >
          {comparisonLabels[d]}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Filters and list controls
 * ------------------------------------------------------------------------- */

export interface PostFilterBarProps {
  basePath: string;
  state: OrganicState;
  choices: { campaigns: ChoiceOption[]; playbooks: ChoiceOption[] };
  labels: { campaign: FilterLabel | null; playbook: FilterLabel | null };
}

/** Filters row (L34): "Add filter" popover plus one clearable chip per active filter. Scopes cards, chart and list. */
export function PostFilterBar({ basePath, state, choices, labels }: PostFilterBarProps) {
  const { navigate, href } = useOrganicNav(basePath, state);
  const activeChips: Array<{ key: string; text: string; clear: Partial<OrganicState>; clearLabel: string }> = [];
  if (labels.campaign) activeChips.push({ key: "campaign", text: `Campaign: ${labels.campaign.label}`, clear: { campaign: null, playbook: null }, clearLabel: "Clear campaign filter" });
  if (labels.playbook) activeChips.push({ key: "playbook", text: `Playbook: ${labels.playbook.label}`, clear: { playbook: null }, clearLabel: "Clear playbook filter" });
  if (state.platform) activeChips.push({ key: "platform", text: `Platform: ${platformLabels[state.platform]}`, clear: { platform: null }, clearLabel: "Clear platform filter" });
  if (state.review) activeChips.push({ key: "review", text: `Review: ${reviewFilterLabels[state.review]}`, clear: { review: null }, clearLabel: "Clear review status filter" });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FiltersPopover state={state} choices={choices} navigate={navigate} activeCount={activeChips.length} />
      {activeChips.length ? (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {activeChips.map((c) => (
            <li key={c.key} className={chip}>
              <span className="max-w-[220px] truncate">{c.text}</span>
              <Link
                href={href(c.clear)}
                scroll={false}
                aria-label={c.clearLabel}
                className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink focus:outline-none md:size-6"
              >
                <X className="size-3.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[13px] text-muted">All campaigns, playbooks and platforms</span>
      )}
      {activeChips.length > 1 ? (
        <Link
          href={href({ campaign: null, playbook: null, platform: null, review: null })}
          scroll={false}
          className="inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline md:min-h-8"
        >
          Clear all filters
        </Link>
      ) : null}
    </div>
  );
}

/** List controls (L02/L35): search, grid/table layout, and the created/active mode menu. */
export function PostListControls({ basePath, state }: { basePath: string; state: OrganicState }) {
  const { navigate, pending } = useOrganicNav(basePath, state);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-80")}>
      <SearchBox key={state.q} initial={state.q} onSearch={(q) => navigate({ q })} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <LayoutToggle value={state.view} onChange={(view) => navigate({ view, page: state.page })} />
        <ModeMenu value={state.mode} onChange={(mode) => navigate({ mode })} />
      </div>
    </div>
  );
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(value.trim());
  }
  return (
    <form role="search" onSubmit={submit} className="relative w-full sm:w-72">
      <label htmlFor={id} className="sr-only">
        Search posts or creators
      </label>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        maxLength={100}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search posts or creators …"
        className="h-11 w-full rounded-[8px] border border-line bg-surface pl-8 pr-9 text-sm text-ink placeholder:text-subtle hover:border-line-strong focus:border-ink-2 focus:outline-none focus-visible:outline-2 md:h-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {initial ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            onSearch("");
          }}
          className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-ink md:size-6"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </form>
  );
}

function FiltersPopover({
  state,
  choices,
  navigate,
  activeCount,
}: {
  state: OrganicState;
  choices: PostFilterBarProps["choices"];
  navigate: (patch: Partial<OrganicState>) => void;
  activeCount: number;
}) {
  const { open, setOpen, triggerRef, panelRef } = usePopover();
  const panelId = useId();
  const selectCls = "h-11 w-full rounded-[8px] border border-line bg-surface px-2.5 text-sm text-ink hover:border-line-strong focus-visible:outline-2 md:h-9";
  return (
    <div className="relative">
      <button ref={triggerRef} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className={toolButton}>
        <ListFilter className="size-3.5" aria-hidden="true" />
        {activeCount ? `Filters (${activeCount})` : "Add filter"}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Filters"
          className="absolute left-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-3 rounded-[12px] border border-line bg-surface p-4 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">Filters</p>
            <button
              type="button"
              onClick={() => navigate({ campaign: null, playbook: null, platform: null, review: null })}
              disabled={!activeCount}
              className="min-h-11 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-50 md:min-h-6"
            >
              Clear all filters
            </button>
          </div>
          <FilterSelect label="Campaign" value={state.campaign ?? ""} className={selectCls} onChange={(v) => navigate({ campaign: v || null, playbook: null })}>
            <option value="">All campaigns</option>
            {choices.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="0">Unattributed (no campaign)</option>
          </FilterSelect>
          <FilterSelect label="Playbook" value={state.playbook ?? ""} className={selectCls} onChange={(v) => navigate({ playbook: v || null })}>
            <option value="">All playbooks</option>
            {choices.playbooks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="0">Custom posts (no playbook)</option>
          </FilterSelect>
          <FilterSelect label="Platform" value={state.platform ?? ""} className={selectCls} onChange={(v) => navigate({ platform: (v || null) as Platform | null })}>
            <option value="">All platforms</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {platformLabels[p]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Review status" value={state.review ?? ""} className={selectCls} onChange={(v) => navigate({ review: (v || null) as ReviewFilter | null })}>
            <option value="">All review statuses</option>
            {reviewFilters.map((r) => (
              <option key={r} value={r}>
                {reviewFilterLabels[r]}
              </option>
            ))}
          </FilterSelect>
          <p className="text-xs text-muted">Filters apply to the metric cards, chart and post list. Search applies to the list only.</p>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({ label, value, onChange, className, children }: { label: string; value: string; onChange: (value: string) => void; className: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        {children}
      </select>
    </div>
  );
}

function LayoutToggle({ value, onChange }: { value: OrganicState["view"]; onChange: (v: OrganicState["view"]) => void }) {
  const options = [
    { value: "table" as const, label: "Table view", icon: Rows3 },
    { value: "grid" as const, label: "Grid view", icon: LayoutGrid },
  ];
  return (
    <div role="group" aria-label="How to lay the posts out" className="inline-flex rounded-[8px] border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex size-10 items-center justify-center rounded-[6px] md:size-7 focus-visible:outline-2",
            value === o.value ? "bg-selected text-ink" : "text-muted hover:text-ink",
          )}
        >
          <o.icon className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** "Show posts: Created in range" menu (L35) with the two documented modes. */
function ModeMenu({ value, onChange }: { value: PostMode; onChange: (mode: PostMode) => void }) {
  const { open, setOpen, close, triggerRef, panelRef } = usePopover();
  const menuId = useId();
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function openMenu() {
    setOpen(true);
    requestAnimationFrame(() => itemRefs.current[postModes.indexOf(value)]?.focus());
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (current + (event.key === "ArrowDown" ? 1 : -1) + postModes.length) % postModes.length;
      itemRefs.current[next]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      itemRefs.current[event.key === "Home" ? 0 : postModes.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={toolButton}
      >
        Show posts: {postModeLabels[value].label}
        <ChevronDown className="size-3.5 text-muted" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={`Show posts: ${postModeLabels[value].label}`}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-[12px] border border-line bg-surface p-1.5 shadow-lg"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted" aria-hidden="true">
            Show posts by:
          </p>
          <div role="separator" className="mb-1 border-t border-line" />
          {postModes.map((mode, i) => (
            <button
              key={mode}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={value === mode}
              tabIndex={-1}
              onClick={() => {
                close();
                if (mode !== value) onChange(mode);
              }}
              className="flex w-full items-start gap-2 rounded-[8px] px-2.5 py-2 text-left hover:bg-hover focus:bg-hover focus:outline-none"
            >
              <Check className={cn("mt-0.5 size-4 shrink-0", value === mode ? "text-ink" : "invisible")} aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-ink">{postModeLabels[mode].label}</span>
                <span className="block text-xs text-muted">{postModeLabels[mode].description}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
