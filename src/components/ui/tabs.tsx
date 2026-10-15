import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface LinkTab {
  key: string;
  label: ReactNode;
  href: string;
  count?: number | null;
}

/** URL-backed tabs (deep-linkable; Back/Forward restore the tab). */
export function LinkTabs({ tabs, activeKey, label, className }: { tabs: LinkTab[]; activeKey: string; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex gap-1 border-b border-line", className)}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? <span className="rounded-full bg-selected px-1.5 text-xs text-ink-2">{tab.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Segmented control for local (non-URL) state, using radio semantics. */
export function Segmented<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  className,
}: {
  name: string;
  label: string;
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-[10px] bg-selected p-0.5", className)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "cursor-pointer rounded-[8px] px-3 py-1 text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
            value === o.value ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
