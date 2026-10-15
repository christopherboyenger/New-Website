"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ProductSection } from "./content";

/**
 * ARIA tabs (automatic activation, roving tabindex, arrow/Home/End keys).
 * Deep links `/#playbooks`, `/#analytics`, … select the matching tab; the
 * anchors themselves are rendered before the tablist so the browser scrolls
 * to the section.
 */
export function ProductPreviewTabs({ sections, diagrams }: { sections: ProductSection[]; diagrams: Record<ProductSection["id"], ReactNode> }) {
  const [active, setActive] = useState<ProductSection["id"]>(sections[0].id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (sections.some((s) => s.id === id)) setActive(id as ProductSection["id"]);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [sections]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = sections.length - 1;
    const target =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (target === null) return;
    event.preventDefault();
    setActive(sections[target].id);
    tabRefs.current[target]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Product areas"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {sections.map((section, index) => {
          const selected = section.id === active;
          return (
            <button
              key={section.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${section.id}`}
              aria-selected={selected}
              aria-controls={`panel-${section.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(section.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
                selected ? "border-white bg-white text-black" : "border-white/15 text-white/75 hover:border-white/40 hover:text-white",
              )}
            >
              {section.label}
            </button>
          );
        })}
      </div>

      {sections.map((section) => (
        <div
          key={section.id}
          role="tabpanel"
          id={`panel-${section.id}`}
          aria-labelledby={`tab-${section.id}`}
          hidden={section.id !== active}
          tabIndex={0}
          className="mt-8 grid items-center gap-10 rounded-[16px] lg:grid-cols-[0.9fr_1.1fr]"
        >
          <div>
            <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{section.title}</h3>
            <p className="mt-3 max-w-lg text-base leading-relaxed text-white/70">{section.body}</p>
            <ul className="mt-6 flex flex-col gap-3">
              {section.points.map((point) => (
                <li key={point} className="flex gap-3 text-sm text-white/85">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div>{diagrams[section.id]}</div>
        </div>
      ))}
    </div>
  );
}
