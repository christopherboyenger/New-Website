"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { matchesCatalogQuery, type CatalogOption } from "@/domain/targeting-catalog";
import { cn } from "@/lib/cn";

/* ----------------------------------------------------------------------------
 * Filter row: label + description, current value, "Add filter" popover
 * ------------------------------------------------------------------------- */

export interface FilterRowProps {
  id: string;
  label: ReactNode;
  description: ReactNode;
  value: ReactNode;
  control: ReactNode;
  error?: string;
  /** Explanation shown under the row (gates, prerequisites). */
  note?: ReactNode;
}

export function FilterRow({ id, label, description, value, control, error, note }: FilterRowProps) {
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0" role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p id={`${id}-label`} className="text-sm font-medium text-ink">
            {label}
          </p>
          <p id={`${id}-description`} className="mt-0.5 text-[13px] text-muted">
            {description}
          </p>
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      <div className="min-w-0">{value}</div>
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      {note}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Chips for multi-value filters
 * ------------------------------------------------------------------------- */

export function ChipList({
  items,
  emptyLabel,
  onRemove,
  disabled,
  noun,
}: {
  items: Array<{ id: string; label: string }>;
  emptyLabel: string;
  onRemove: (id: string) => void;
  disabled?: boolean;
  /** Used in each remove button's accessible name: "Remove United States from countries". */
  noun: string;
}) {
  if (!items.length) return <span className="text-sm text-ink-2">{emptyLabel}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={`Selected ${noun}`}>
      {items.map((item) => (
        <li key={item.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas py-0.5 pr-1 pl-2.5 text-[13px] text-ink">
          {item.label}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            disabled={disabled}
            className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-50 max-md:size-8"
            aria-label={`Remove ${item.label} from ${noun}`}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------------------
 * Popover anchored to a trigger button (non-modal dialog)
 * ------------------------------------------------------------------------- */

export interface FilterPopoverProps {
  triggerId: string;
  triggerLabel: string;
  /** Accessible name of the trigger, e.g. "Add countries filter". */
  triggerAriaLabel: string;
  dialogLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  children: (close: () => void) => ReactNode;
}

/**
 * Escape closes and returns focus to the trigger; clicking or tabbing
 * outside closes without stealing focus.
 */
export function FilterPopover({ triggerId, triggerLabel, triggerAriaLabel, dialogLabel, disabled, invalid, describedBy, children }: FilterPopoverProps) {
  const [openState, setOpen] = useState(false);
  const open = openState && !disabled;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const closeAndReturnFocus = () => {
    setOpen(false);
    document.getElementById(triggerId)?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("input, button, [tabindex]:not([tabindex='-1'])")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={(event) => {
        if (open && !wrapperRef.current?.contains(event.relatedTarget as Node | null) && event.relatedTarget !== null) setOpen(false);
      }}
    >
      <Button
        id={triggerId}
        variant="secondary"
        size="sm"
        className="max-md:min-h-11"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label={triggerAriaLabel}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <Plus className="size-3.5" aria-hidden="true" />
        {triggerLabel}
      </Button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={dialogLabel}
          className="absolute top-full left-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-[12px] border border-line bg-surface p-2 shadow-lg sm:right-0 sm:left-auto"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeAndReturnFocus();
            }
          }}
        >
          {children(closeAndReturnFocus)}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Searchable option list (combobox + listbox)
 * ------------------------------------------------------------------------- */

export interface OptionPickerProps {
  /** Noun for labels: "countries", "platforms". */
  label: string;
  options: CatalogOption[];
  selected: readonly string[];
  multiple: boolean;
  onChange: (selected: string[]) => void;
  onDone: () => void;
  searchable?: boolean;
}

export function OptionPicker({ label, options, selected, multiple, onChange, onDone, searchable = true }: OptionPickerProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => options.filter((o) => matchesCatalogQuery(o, query)), [options, query]);
  const [active, setActive] = useState(0);
  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const optionId = (id: string) => `${baseId}-opt-${id}`;
  const activeOption = filtered[activeIndex];
  const activeDomId = activeOption ? optionId(activeOption.id) : undefined;

  useEffect(() => {
    if (activeDomId) document.getElementById(activeDomId)?.scrollIntoView({ block: "nearest" });
  }, [activeDomId]);

  const choose = (id: string) => {
    if (multiple) {
      onChange(selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else {
      onChange([id]);
      onDone();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(activeIndex + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Home" && !searchable) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && !searchable) {
      event.preventDefault();
      setActive(filtered.length - 1);
    } else if (event.key === "Enter" || (event.key === " " && !searchable)) {
      event.preventDefault();
      if (activeOption) choose(activeOption.id);
    }
  };

  const focusProps = { "aria-activedescendant": activeDomId, onKeyDown };

  return (
    <div className="flex flex-col gap-2">
      {searchable ? (
        <input
          type="text"
          role="combobox"
          aria-controls={listId}
          aria-expanded="true"
          aria-autocomplete="list"
          aria-label={`Search ${label}`}
          placeholder={`Search ${label}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          autoComplete="off"
          className="h-9 w-full rounded-[8px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-subtle focus:border-ink-2 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
          {...focusProps}
        />
      ) : null}
      <ul
        id={listId}
        role="listbox"
        aria-label={label[0].toUpperCase() + label.slice(1)}
        aria-multiselectable={multiple || undefined}
        tabIndex={searchable ? -1 : 0}
        className="max-h-64 overflow-y-auto rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-1"
        {...(searchable ? {} : focusProps)}
      >
        {filtered.map((option, index) => {
          const isSelected = selectedSet.has(option.id);
          return (
            <li
              key={option.id}
              id={optionId(option.id)}
              role="option"
              aria-selected={isSelected}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(option.id)}
              className={cn(
                "flex min-h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-sm text-ink max-md:min-h-11",
                index === activeIndex && "bg-hover",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-4 shrink-0 items-center justify-center border",
                  multiple ? "rounded-[4px]" : "rounded-full",
                  isSelected ? "border-ink bg-ink text-white" : "border-line-strong bg-surface",
                )}
                aria-hidden="true"
              >
                {isSelected ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 ? <p className="px-2.5 py-2 text-sm text-muted">No {label} match “{query.trim()}”.</p> : null}
      {multiple ? (
        <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
          <span className="px-1 text-[13px] text-muted" aria-live="polite">
            {selected.length ? `${selected.length} selected` : `All ${label}`}
          </span>
          <div className="flex gap-1.5">
            {selected.length ? (
              <Button variant="ghost" size="sm" onClick={() => onChange([])}>
                Clear
              </Button>
            ) : null}
            <Button variant="primary" size="sm" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
