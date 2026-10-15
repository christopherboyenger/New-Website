"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Textarea } from "@/components/ui/form";
import { playbookLimits } from "@/domain/playbook-validation";

/** "General Instructions": collapsed behind Add until the brand writes something. */
export function GeneralInstructions({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [expanded, setExpanded] = useState(value.trim().length > 0);
  const id = "general-instructions";
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-[12px] border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold text-ink">
            General instructions
          </h2>
          <p id={`${id}-description`} className="mt-1 text-sm text-muted">
            Set the stage for every creator who follows this playbook.
          </p>
        </div>
        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex min-h-9 items-center gap-1 rounded-[8px] border border-line px-3 text-sm font-medium text-ink hover:bg-hover max-md:min-h-11"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        ) : null}
      </div>
      {expanded ? (
        <>
          <label htmlFor={id} className="sr-only">
            General instructions
          </label>
          <Textarea
            id={id}
            autoFocus={value.length === 0}
            value={value}
            maxLength={playbookLimits.instructions}
            placeholder="Tone, setting, do's and don'ts that apply to every scene…"
            aria-describedby={`${id}-description`}
            onChange={(e) => onChange(e.target.value)}
            className="mt-3"
          />
        </>
      ) : null}
    </section>
  );
}
