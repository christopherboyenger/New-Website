import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Wide tables scroll horizontally inside their card instead of dropping columns. */
export function TableScroll({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div className={cn("relative w-full overflow-x-auto", className)} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export function Table({ className, ...rest }: ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-left text-sm", className)} {...rest} />;
}

export function THead({ className, ...rest }: ComponentProps<"thead">) {
  return <thead className={cn("border-b border-line bg-canvas/60 text-xs font-medium text-muted", className)} {...rest} />;
}

export function TH({ className, ...rest }: ComponentProps<"th">) {
  return <th scope="col" className={cn("whitespace-nowrap px-3 py-2.5 font-medium", className)} {...rest} />;
}

export function TR({ className, ...rest }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line last:border-0 hover:bg-canvas/50", className)} {...rest} />;
}

export function TD({ className, ...rest }: ComponentProps<"td">) {
  return <td className={cn("whitespace-nowrap px-3 py-2.5 text-ink", className)} {...rest} />;
}

/**
 * Sortable column header that encodes sort in the URL (server-side sorting).
 * `href` builders keep other query state intact.
 */
export function SortHeader({
  label,
  active,
  direction,
  href,
  className,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  href: string;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap px-3 py-2.5 font-medium", className)}>
      <Link href={href} scroll={false} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden="true" />
      </Link>
    </th>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  prevHref,
  nextHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const linkCls = "inline-flex h-8 items-center gap-1 rounded-[8px] border border-line px-2.5 text-[13px] text-ink hover:bg-hover";
  const disabledCls = "inline-flex h-8 items-center gap-1 rounded-[8px] border border-line px-2.5 text-[13px] text-subtle";
  return (
    <nav className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px] text-muted" aria-label="Pagination">
      <span>
        {start}–{end} of {total}
      </span>
      <div className="flex gap-2">
        {prevHref ? (
          <Link href={prevHref} scroll={false} className={linkCls}>
            <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous
          </Link>
        ) : (
          <span className={disabledCls} aria-disabled="true">
            <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous
          </span>
        )}
        {nextHref ? (
          <Link href={nextHref} scroll={false} className={linkCls}>
            Next <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className={disabledCls} aria-disabled="true">
            Next <ChevronRight className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
