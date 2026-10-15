import type { ReactNode } from "react";
import Link from "next/link";
import { LayoutDashboard, LogOut } from "lucide-react";
import { signOutAction } from "@/server/auth/actions";
import { Wordmark } from "@/components/onboarding/surface";
import { CreatorAvatar } from "@/components/creators/creator-avatar";
import { CreatorNav } from "./creator-nav";

/**
 * Creator-portal chrome: wordmark, a "Creator" marker, top navigation and the
 * account controls. Uses the dashboard palette on a top bar (no sidebar):
 * creators work in a few pages, mostly on phones.
 */
export function CreatorShell({
  displayName,
  hasBrandWorkspace,
  children,
}: {
  displayName: string | null;
  hasBrandWorkspace: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <a href="#creator-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Wordmark className="[&_span]:text-[22px]" />
            <span className="rounded-full bg-selected px-2 py-0.5 text-xs font-medium text-ink-2">Creator</span>
          </div>
          <div className="flex items-center gap-1">
            {hasBrandWorkspace ? (
              <Link href="/home" className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2.5 text-sm text-ink-2 hover:bg-hover hover:text-ink">
                <LayoutDashboard className="size-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Brand workspace</span>
              </Link>
            ) : null}
            {displayName ? (
              <span className="hidden items-center gap-2 px-2 text-sm text-ink-2 sm:inline-flex">
                <CreatorAvatar name={displayName} />
                <span className="max-w-40 truncate">{displayName}</span>
              </span>
            ) : null}
            <form action={signOutAction}>
              <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2.5 text-sm text-ink-2 hover:bg-hover hover:text-ink">
                <LogOut className="size-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
        {displayName ? (
          <div className="mx-auto w-full max-w-5xl px-2 sm:px-4">
            <CreatorNav />
          </div>
        ) : null}
      </header>
      <main id="creator-main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-8">
        {children}
      </main>
    </div>
  );
}
