"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { commercialPolicy } from "@/config/commercial-policy";
import { formatUsd } from "@/lib/money";
import { startPlanManagementAction, startUpgradeAction } from "@/app/home/[org]/(workspace)/billing/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";

/**
 * Upgrade (Basic → Unlimited) through a provider-hosted subscription
 * checkout, after a confirmation that states the plan terms from the
 * commercial policy. The plan changes only when the provider confirms.
 */
export function UpgradeButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unlimited = commercialPolicy.plans.unlimited;

  function proceed() {
    setError(null);
    startTransition(async () => {
      const result = await startUpgradeAction(slug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.status === "redirect") {
        window.location.assign(result.data.url);
        return;
      }
      setError(result.data.message);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Upgrade
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={`Upgrade to ${unlimited.displayName}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={proceed} loading={pending}>
              Continue to secure checkout
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          <p>
            <span className="font-semibold text-ink">{formatUsd(unlimited.monthlyPriceCents)}/month.</span> {unlimited.summary}
          </p>
          <ul className="flex flex-col gap-1.5">
            {unlimited.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
          <p className="text-muted">
            You’ll review the final amount on our payment provider’s secure checkout page before confirming. Your plan changes once the provider confirms the
            subscription.
          </p>
          <FormError message={error} />
        </div>
      </Dialog>
    </>
  );
}

/** Opens the provider-hosted subscription management page (change or cancel the plan). */
export function ManagePlanButton({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setError(null);
    startTransition(async () => {
      const result = await startPlanManagementAction(slug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.status === "redirect") {
        window.location.assign(result.data.url);
        return;
      }
      setError(result.data.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={open} loading={pending}>
        Manage plan
      </Button>
      {error ? (
        <p role="alert" className="max-w-64 text-right text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
