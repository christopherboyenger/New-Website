"use client";

import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { Input, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";

/**
 * Editable list of text options (on-screen text, captions, descriptions).
 * Each option is individually labelled ("On-screen text 1") with its own
 * remove button; a newly added option receives focus.
 */
export function OptionList({
  itemLabel,
  values,
  onChange,
  placeholder,
  addLabel,
  addAccessibleLabel,
  emptyText,
  maxLength,
  multiline = false,
  heading,
  hint,
}: {
  /** Singular accessible label, numbered per option: "On-screen text" → "On-screen text 1". */
  itemLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
  /** Distinguishes repeated add buttons; must start with the visible label. */
  addAccessibleLabel?: string;
  emptyText?: string;
  maxLength: number;
  multiline?: boolean;
  heading: string;
  hint?: string;
}) {
  const focusIndex = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (focusIndex.current === null) return;
    const target = listRef.current?.querySelector<HTMLElement>(`[data-option-index="${focusIndex.current}"]`);
    target?.focus();
    focusIndex.current = null;
  }, [values.length]);

  const update = (index: number, value: string) => onChange(values.map((v, i) => (i === index ? value : v)));
  const remove = (index: number) => onChange(values.filter((_, i) => i !== index));
  const add = () => {
    focusIndex.current = values.length;
    onChange([...values, ""]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink">
          {heading}
          {hint ? <span className="ml-1.5 font-normal text-muted">{hint}</span> : null}
        </p>
        <button
          type="button"
          onClick={add}
          aria-label={addAccessibleLabel}
          className="inline-flex min-h-8 items-center gap-1 rounded-[8px] px-2 text-[13px] font-medium text-ink-2 hover:bg-hover hover:text-ink max-md:min-h-11"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {addLabel}
        </button>
      </div>
      {values.length === 0 && emptyText ? <p className="text-[13px] text-muted">{emptyText}</p> : null}
      {values.length > 0 ? (
        <ol ref={listRef} className="flex flex-col gap-2">
          {values.map((value, index) => {
            const label = `${itemLabel} ${index + 1}`;
            const common = {
              "aria-label": label,
              "data-option-index": index,
              value,
              placeholder,
              maxLength,
            };
            return (
              <li key={index} className="flex items-start gap-2">
                {multiline ? (
                  <Textarea {...common} rows={2} className="min-h-16" onChange={(e) => update(index, e.target.value)} />
                ) : (
                  <Input {...common} onChange={(e) => update(index, e.target.value)} />
                )}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Remove ${label.toLowerCase()}`}
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-ink max-md:size-11",
                  )}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
