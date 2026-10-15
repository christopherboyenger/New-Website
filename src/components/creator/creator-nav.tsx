"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const items = [
  { href: "/creator", label: "Home", exact: true },
  { href: "/creator/campaigns", label: "Campaigns", exact: false },
  { href: "/creator/submissions", label: "Submissions", exact: false },
  { href: "/creator/profile", label: "Profile", exact: false },
];

/** Primary creator-portal navigation. Scrolls horizontally on narrow screens instead of collapsing into a menu. */
export function CreatorNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Creator portal" className={cn("-mb-px flex gap-1 overflow-x-auto", className)}>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm transition-colors md:min-h-12",
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
