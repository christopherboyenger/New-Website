"use client";

import { ChevronLeft } from "lucide-react";
import { GuardedLink } from "./navigation-guard";

/** Specialized-workspace header: back to Campaigns, page title. No sidebar (L17). */
export function EditorTopBar({ backHref }: { backHref: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-1.5 px-2 md:px-4 lg:px-6">
        <nav aria-label="Breadcrumb">
          <GuardedLink
            href={backHref}
            className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink max-md:min-h-11"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Campaigns
          </GuardedLink>
        </nav>
        <span className="text-subtle" aria-hidden="true">
          /
        </span>
        <h1 className="truncate text-sm font-semibold text-ink">New campaign</h1>
      </div>
    </header>
  );
}
