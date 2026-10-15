"use client";

import { CircleAlert } from "lucide-react";
import { PlanBadge } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formSections, type FormSectionId, type SectionSummary } from "./model";
import { sectionDomId } from "./section-frame";

export interface SectionNavProps {
  active: FormSectionId;
  onSelect: (id: FormSectionId) => void;
  summaries: Record<FormSectionId, SectionSummary>;
  errorSections: Set<FormSectionId>;
  /** Plan badge on the Approvals entry when its settings are gated (observed L17). */
  approvalsBadgePlanName: string | null;
}

/**
 * Left section navigation with current-value summaries. Below 768px it
 * becomes a labelled native select so every section stays one tap away.
 */
export function SectionNav({ active, onSelect, summaries, errorSections, approvalsBadgePlanName }: SectionNavProps) {
  return (
    <>
      <div className="md:hidden">
        <label htmlFor="section-select" className="mb-1.5 block text-[13px] font-medium text-ink-2">
          Section
        </label>
        <Select id="section-select" value={active} onChange={(e) => onSelect(e.target.value as FormSectionId)} className="h-11">
          {formSections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}: {summaries[section.id].lines.join(" · ")}
              {errorSections.has(section.id) ? " (needs attention)" : ""}
            </option>
          ))}
        </Select>
      </div>

      <nav aria-label="Campaign sections" className="hidden md:block">
        <ul className="flex flex-col gap-1.5">
          {formSections.map((section) => {
            const isActive = section.id === active;
            const hasError = errorSections.has(section.id);
            return (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  aria-controls={sectionDomId(section.id)}
                  onClick={() => onSelect(section.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors",
                    isActive ? "border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]" : "border-transparent hover:bg-hover",
                    hasError && "border-danger-line",
                  )}
                >
                  <span className="flex w-full flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                    {section.label}
                    {section.id === "approvals" && approvalsBadgePlanName ? <PlanBadge planName={approvalsBadgePlanName} /> : null}
                    {hasError ? (
                      <span className="ml-auto inline-flex items-center text-danger">
                        <CircleAlert className="size-4" aria-hidden="true" />
                        <span className="sr-only">Needs attention</span>
                      </span>
                    ) : null}
                  </span>
                  {summaries[section.id].lines.map((line, index) => (
                    <span key={index} className="block w-full truncate text-[13px] text-muted">
                      {line}
                    </span>
                  ))}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
