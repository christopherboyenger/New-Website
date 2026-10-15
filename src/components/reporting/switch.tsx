"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Two-state switch (role="switch"). `checked` must be the REAL persisted state;
 * clicking only asks the parent to confirm a change (evidence audit item 5:
 * the label "Active" is not proof the entity is active).
 */
export function Switch({
  checked,
  className,
  ...rest
}: Omit<ComponentProps<"button">, "role" | "aria-checked" | "type"> & { checked: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        "group relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        "before:absolute before:-inset-3 before:content-[''] md:before:-inset-1",
        checked ? "bg-ink" : "bg-line-strong",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn("inline-block size-4 rounded-full bg-surface shadow-sm transition-transform", checked ? "translate-x-[17px]" : "translate-x-[1px]")}
      />
    </button>
  );
}
