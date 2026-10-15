"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import type { PaymentReadiness } from "@/server/billing/payment-setup";
import { refreshPaymentStatusAction } from "@/app/home/[org]/(workspace)/billing/actions";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/feedback";
import { PaymentSetupButton } from "./payment-setup-button";

function cardLabel(payment: PaymentReadiness): string {
  if (!payment.brand) return "Card on file";
  const brand = payment.brand === "amex" ? "American Express" : payment.brand.charAt(0).toUpperCase() + payment.brand.slice(1);
  return payment.last4 ? `${brand} •••• ${payment.last4}` : brand;
}

/**
 * Payment method status from provider-confirmed state only. "pending" is
 * shown as "Payment status is being confirmed" with a server-side status
 * check; nothing is ever marked ready from a browser return.
 */
export function PaymentMethodPanel({ slug, payment, canManage }: { slug: string; payment: PaymentReadiness; canManage: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();

  function checkAgain() {
    setMessage(null);
    startCheck(async () => {
      const result = await refreshPaymentStatusAction(slug);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (result.data.status === "pending") setMessage(result.message ?? "Still waiting for the payment provider to confirm. Check again in a moment.");
      else if (result.message) setMessage(result.message);
      router.refresh();
    });
  }

  if (payment.status === "ready") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <CreditCard className="size-4 text-muted" aria-hidden="true" />
          {cardLabel(payment)}
        </p>
        {canManage ? <PaymentSetupButton slug={slug} label="Update payment method" dialogTitle="Update payment method" variant="secondary" size="sm" /> : null}
      </div>
    );
  }

  if (payment.status === "pending") {
    return (
      <div className="flex flex-col gap-2">
        <InlineAlert tone="info" title="Payment status is being confirmed">
          Your payment provider hasn’t confirmed the card yet. This usually takes a few seconds.
        </InlineAlert>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={checkAgain} loading={checking}>
            Check again
          </Button>
          {canManage ? <PaymentSetupButton slug={slug} label="Start over" dialogTitle="Start card setup again" variant="ghost" size="sm" /> : null}
        </div>
        {message ? (
          <p role="status" className="text-[13px] text-muted">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {payment.status === "failed" ? (
        <InlineAlert tone="danger" title="Payment failed">
          The last charge or card setup didn’t go through. Add a card that can be charged.
        </InlineAlert>
      ) : payment.status === "requires_action" ? (
        <InlineAlert tone="warning" title="Your bank needs an extra confirmation">
          Add the card again to complete your bank’s verification.
        </InlineAlert>
      ) : (
        <p className="text-sm text-muted">No payment method on file.</p>
      )}
      {canManage ? (
        <div>
          <PaymentSetupButton
            slug={slug}
            label={payment.status === "none" ? "Add payment method" : "Update payment method"}
            dialogTitle={payment.status === "none" ? "Add a payment method" : "Update payment method"}
            size="sm"
          />
        </div>
      ) : null}
    </div>
  );
}
