import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";

/**
 * Onboarding-surface building blocks (white canvas, navy text, slate helpers
 * and borders) shared by the auth pages and the brand onboarding wizard.
 * Labels/errors still come from the `Field`/`describedBy` primitives.
 */

const surfaceControl =
  "w-full rounded-[10px] border border-slate-line bg-surface px-4 text-[15px] text-navy placeholder:text-slate-help/70 transition-colors hover:border-slate-help/50 focus:border-navy focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 disabled:bg-slate-fill aria-invalid:border-danger";

export function SurfaceInput({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(surfaceControl, "h-12", className)} {...rest} />;
}

export function SurfaceTextarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(surfaceControl, "min-h-24 py-3 leading-relaxed", className)} {...rest} />;
}

/** Navy label text for `Field` on this surface. */
export function SurfaceLabel({ children }: { children: ReactNode }) {
  return <span className="text-[15px] text-navy">{children}</span>;
}

/** Slate helper text for `Field` descriptions on this surface. */
export function SurfaceHelp({ children }: { children: ReactNode }) {
  return <span className="text-sm text-slate-help">{children}</span>;
}

/** Product wordmark from site config (never the reference product's logo). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 rounded-md text-navy", className)}>
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden="true">
        <circle cx="14" cy="14" r="13" fill="var(--color-accent)" />
        <circle cx="14" cy="14" r="5.5" fill="var(--color-surface)" />
      </svg>
      <span className="text-[26px] font-bold leading-none tracking-tight">{site.wordmark}</span>
    </Link>
  );
}

/** Bordered header action (agent dialog trigger, "Questions?"). */
export const headerActionClass =
  "inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-line bg-surface px-3 text-sm font-semibold text-navy transition-colors hover:bg-slate-fill sm:h-10 sm:px-4";

export function StepHeading({ id = "onboarding-step-title", className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <h1 id={id} tabIndex={-1} className={cn("text-[28px] font-bold leading-tight tracking-tight text-navy focus:outline-none sm:text-[32px]", className)}>
      {children}
    </h1>
  );
}

export function StepLead({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("mt-3 text-base text-slate-help", className)}>{children}</p>;
}
