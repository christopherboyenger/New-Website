"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { paymentSetupDisclosure } from "@/config/commercial-policy";
import { startPaymentSetupAction } from "@/app/home/[org]/(workspace)/billing/actions";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";

/**
 * Opens the shared payment disclosure first; only "Continue to secure
 * checkout" asks the server for a provider-hosted setup page and navigates
 * there. Nothing is charged here, and card details are never entered on
 * this site.
 */
export function PaymentSetupButton({
  slug,
  label,
  variant = "primary",
  size = "md",
  className,
  dialogTitle = "Add a payment method",
}: {
  slug: string;
  label: string;
  dialogTitle?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function proceed() {
    setError(null);
    startTransition(async () => {
      const result = await startPaymentSetupAction(slug);
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
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={dialogTitle}
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
          <p className="text-ink">{paymentSetupDisclosure()}</p>
          <p className="flex items-start gap-2 text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>You’ll enter your card on our payment provider’s secure page. Card details are never stored by this workspace.</span>
          </p>
          <FormError message={error} />
        </div>
      </Dialog>
    </>
  );
}
