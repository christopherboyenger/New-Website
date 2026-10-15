import type { ReactNode } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { site } from "@/config/site";
import { signOutAction } from "@/server/auth/actions";
import { OpsNav } from "./ops-nav";

/** Operator console frame: product wordmark, console label, section tabs and the signed-in operator. */
export function OpsShell({ operatorEmail, children }: { operatorEmail: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-[8px] bg-ink px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pt-3 sm:px-6 lg:px-8">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="font-semibold tracking-tight text-ink">{site.wordmark}</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span className="inline-flex items-center gap-1 font-medium text-ink-2">
              <ShieldCheck className="size-4 text-muted" aria-hidden="true" />
              Operator console
            </span>
          </p>
          <p className="hidden truncate text-[13px] text-muted sm:block" title="Signed in as">
            {operatorEmail}
          </p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink md:min-h-8"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
        <div className="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
          <OpsNav />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
    </div>
  );
}
