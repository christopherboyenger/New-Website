"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const items = [
  { href: "/ops", label: "Overview", exact: true },
  { href: "/ops/review", label: "Review queue" },
  { href: "/ops/webhooks", label: "Webhooks" },
  { href: "/ops/leads", label: "Leads" },
] as const;

/** Console section tabs; scroll horizontally on narrow screens. */
export function OpsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Operator console" className="-mb-px flex overflow-x-auto">
      {items.map((item) => {
        const active = "exact" in item ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm transition-colors md:min-h-10",
              active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
