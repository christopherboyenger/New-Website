import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { GuardedLink } from "./navigation-guard";

export interface GateContext {
  /** Display name of the plan that unlocks gated settings ("Unlimited"). */
  planName: string;
  /** Billing route for users allowed to change the plan; null hides the link. */
  billingHref: string | null;
}

/**
 * Explains why a gated control is disabled, next to it, with the upgrade
 * route for owners. Visual only: the server rejects gated settings anyway.
 */
export function PlanGateNote({ gate, children, className }: { gate: GateContext; children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[13px] text-muted", className)}>
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {children}{" "}
        {gate.billingHref ? (
          <GuardedLink href={gate.billingHref} className="font-medium text-ink underline underline-offset-2 hover:text-ink-2">
            Upgrade to {gate.planName}
          </GuardedLink>
        ) : (
          <>Ask a workspace owner about upgrading to {gate.planName}.</>
        )}
      </span>
    </p>
  );
}

/** Compact lock marker inside small buttons; its text completes the button's accessible name. */
export function LockMarker({ planName }: { planName: string }) {
  return (
    <span className="inline-flex items-center text-accent-ink" title={`Requires ${planName}`}>
      <Lock className="size-3" aria-hidden="true" />
      <span className="sr-only">Requires {planName}</span>
    </span>
  );
}
