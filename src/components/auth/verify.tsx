"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { confirmEmailAction, resendVerificationAction } from "@/server/auth/actions";
import type { EmailDeliveryStatus } from "@/server/email";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/feedback";

/**
 * Consumes a verification token only when the person submits it, so link
 * scanners that prefetch email links cannot use it up.
 */
export function ConfirmEmailForm({ token, continueHref, continueLabel, fallback }: { token: string; continueHref: string; continueLabel: string; fallback?: ReactNode }) {
  const [state, action, pending] = useActionState(confirmEmailAction, null);
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-6">
        <p role="status" className="flex items-center gap-2 rounded-[12px] border border-success-line bg-success-soft px-4 py-3 text-[15px] text-navy">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
          Your email address is verified.
        </p>
        <ButtonLink href={continueHref} variant="navy" size="lg" className="h-12 w-full">
          {continueLabel}
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <FormError message={state && !state.ok ? state.error : null} />
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="navy" size="lg" className="h-12 w-full" loading={pending}>
          Verify email address
        </Button>
      </form>
      {state && !state.ok ? fallback : null}
    </div>
  );
}

/**
 * Sends a fresh verification link to the signed-in user and reports what
 * actually happened to it. Until then it shows the last known delivery state
 * (`latest`), when the caller has one.
 */
export function ResendVerification({
  email,
  devOutboxHref,
  latest,
}: {
  email: string;
  devOutboxHref: string | null;
  latest?: { status: EmailDeliveryStatus | "queued"; at: Date } | null;
}) {
  const [state, action, pending] = useActionState(resendVerificationAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div aria-live="polite" className="empty:hidden">
        {state?.ok ? (
          <DeliveryMessage status={state.data.delivery} email={state.data.email} devOutboxHref={devOutboxHref} fresh />
        ) : state ? (
          <FormError message={state.error} />
        ) : latest ? (
          <DeliveryMessage status={latest.status} at={latest.at} email={email} devOutboxHref={devOutboxHref} />
        ) : latest === null ? (
          <p className="text-[15px] text-slate-help">No verification email has been sent to {email} yet.</p>
        ) : null}
      </div>
      <Button type="submit" variant="secondary" size="lg" className="h-12 w-full" loading={pending}>
        Resend verification email
      </Button>
      <p className="text-center text-sm text-slate-help">The link will be sent to {email}.</p>
    </form>
  );
}

/** Honest delivery state of a verification email (never "sent" unless the provider accepted it). */
export function DeliveryMessage({
  status,
  email,
  devOutboxHref,
  fresh,
  at,
}: {
  status: EmailDeliveryStatus | "queued";
  email: string;
  devOutboxHref: string | null;
  /** True for the result of the request just made. */
  fresh?: boolean;
  at?: Date;
}) {
  const when = at ? ` on ${at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : "";
  switch (status) {
    case "sent":
      return (
        <InlineAlert tone="success">
          {fresh ? `We sent a new verification link to ${email}.` : `We sent a verification link to ${email}${when}.`} Open it to verify your address.
        </InlineAlert>
      );
    case "queued":
      return <InlineAlert tone="info">A verification email to {email} is waiting to be delivered.</InlineAlert>;
    case "failed":
      return (
        <InlineAlert tone="danger" title="The email could not be delivered">
          Delivery to {email} failed{fresh ? "" : when}. Check the address or try again later.
        </InlineAlert>
      );
    case "provider_unconfigured":
      return (
        <InlineAlert tone="warning" title="The email could not be delivered">
          This deployment has no email provider configured, so no verification email reached {email}.
          {devOutboxHref ? (
            <>
              {" "}
              In development you can open the link from the{" "}
              <Link href={devOutboxHref} className="font-medium text-ink underline underline-offset-2">
                development outbox
              </Link>
              .
            </>
          ) : null}
        </InlineAlert>
      );
  }
}
