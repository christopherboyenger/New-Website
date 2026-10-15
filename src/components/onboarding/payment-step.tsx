"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CreditCard } from "lucide-react";
import { paymentSetupDisclosure } from "@/config/commercial-policy";
import type { PaymentReadiness, PaymentSetupStart } from "@/server/billing/payment-setup";
import { beginPaymentSetupAction, checkPaymentStatusAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { InlineAlert, NotConfiguredNotice } from "@/components/ui/feedback";
import { formatUsd } from "@/lib/money";
import { StepHeading, StepLead } from "./surface";

/**
 * Final screen: provider-hosted card setup. The card is never collected
 * here; readiness comes only from provider-confirmed server state, so Finish
 * stays disabled until the server reports "ready". Nothing is charged.
 */
export function PaymentStep({
  payment,
  thresholdCents,
  busy,
  onPaymentChange,
  onFinishLater,
}: {
  /** Null when the user may not view billing for this workspace. */
  payment: PaymentReadiness | null;
  thresholdCents: number;
  /** Completion is in progress (disables the actions here). */
  busy: boolean;
  onPaymentChange: (payment: PaymentReadiness) => void;
  onFinishLater: () => void;
}) {
  const [setup, setSetup] = useState<PaymentSetupStart | { status: "failed"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function addPaymentMethod() {
    startTransition(async () => {
      const result = await beginPaymentSetupAction();
      if (!result.ok) {
        setSetup({ status: "failed", message: result.error });
        if (result.code === "conflict") {
          const latest = await checkPaymentStatusAction();
          if (latest.ok) onPaymentChange(latest.data);
        }
        return;
      }
      setSetup(result.data);
      if (result.data.status === "redirect") window.location.assign(result.data.url);
    });
  }

  function checkAgain() {
    startTransition(async () => {
      const result = await checkPaymentStatusAction();
      if (result.ok) {
        onPaymentChange(result.data);
        setSetup(null);
      } else {
        setSetup({ status: "failed", message: result.error });
      }
    });
  }

  const disabled = pending || busy;

  return (
    <div className="w-full max-w-[690px]">
      <StepHeading>You’re almost there</StepHeading>
      <StepLead>Add a payment method to put your playbook live</StepLead>

      <section aria-labelledby="payment-details-title" className="mt-8 overflow-hidden rounded-[12px] border border-info-line">
        <div className="flex items-start gap-3 border-b border-info-line bg-info-soft px-5 py-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-info text-white" aria-hidden="true">
            <CreditCard className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="payment-details-title" className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-navy">
              Payment Details
              <span className="inline-flex items-center rounded-full bg-info-line/70 px-2 py-0.5 text-xs font-medium text-info">Final step</span>
            </h2>
            <p className="mt-0.5 text-sm text-info">We’ll charge in {formatUsd(thresholdCents)} increments as creators earn for you</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <p className="text-sm text-slate-help">{paymentSetupDisclosure()}</p>

          {payment === null ? (
            <InlineAlert tone="info">Only workspace owners can add a payment method. You can still finish setup later.</InlineAlert>
          ) : payment.status === "ready" ? (
            <p role="status" className="flex items-center gap-2 rounded-[10px] border border-success-line bg-success-soft px-4 py-3 text-sm text-navy">
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                {payment.brand && payment.last4 ? `${capitalize(payment.brand)} ending in ${payment.last4}` : "A payment method"} is on file. Choose Finish to
                continue.
              </span>
            </p>
          ) : payment.status === "pending" ? (
            <InlineAlert
              tone="info"
              title="Confirming your payment method"
              action={
                <Button variant="secondary" size="sm" onClick={checkAgain} loading={pending} disabled={busy}>
                  Check again
                </Button>
              }
            >
              The payment provider hasn’t confirmed your card yet.
            </InlineAlert>
          ) : (
            <>
              {payment.status === "failed" ? (
                <InlineAlert tone="warning">The last card setup didn’t complete. Try adding the card again.</InlineAlert>
              ) : payment.status === "requires_action" ? (
                <InlineAlert tone="warning">Your bank needs an extra confirmation. Add the card again to complete it.</InlineAlert>
              ) : null}
              <Button variant="navy" size="lg" className="w-full" onClick={addPaymentMethod} loading={pending} disabled={busy}>
                Add payment method
              </Button>
            </>
          )}

          <div aria-live="polite">
            {setup?.status === "not_configured" ? (
              <NotConfiguredNotice title="Card payments aren’t available yet">{setup.message}</NotConfiguredNotice>
            ) : setup?.status === "error" || setup?.status === "failed" ? (
              <InlineAlert tone="danger">{setup.message}</InlineAlert>
            ) : setup?.status === "redirect" ? (
              <p className="text-sm text-slate-help">Opening the secure payment page…</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mt-6">
        <button
          type="button"
          onClick={onFinishLater}
          disabled={disabled}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4 disabled:opacity-50 sm:min-h-0"
        >
          I’ll finish later
        </button>
        <p className="mt-1 max-w-[560px] text-sm text-slate-help">
          Your workspace, first campaign and draft playbook are saved either way. Nothing goes live until you add a payment method and publish.
        </p>
      </div>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
