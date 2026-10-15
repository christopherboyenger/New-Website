"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, resetPasswordAction } from "@/server/auth/actions";
import { ButtonLink } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/feedback";
import { AuthField, AuthFormError, fieldError, PasswordField, SubmitButton } from "./fields";

/**
 * Asks for a reset link. The confirmation is identical whether or not an
 * account exists; it only reflects whether this deployment can send email.
 */
export function RequestResetForm({ supportEmail }: { supportEmail: string | null }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, null);
  if (state?.ok) {
    const email = state.values?.email ?? "that address";
    return (
      <div className="flex flex-col gap-6">
        {state.data.emailDeliveryConfigured ? (
          <InlineAlert tone="success" title="Check your email">
            If an account exists for {email}, we’ve sent a link to reset its password. The link expires in one hour.
          </InlineAlert>
        ) : (
          <InlineAlert tone="warning" title="Reset emails can’t be delivered yet">
            This deployment has no email provider configured, so no reset link can be emailed to {email}.
            {supportEmail ? (
              <>
                {" "}
                Contact{" "}
                <a href={`mailto:${supportEmail}`} className="font-medium text-ink underline underline-offset-2">
                  {supportEmail}
                </a>{" "}
                for help.
              </>
            ) : null}
          </InlineAlert>
        )}
        <Link href="/auth/sign-in" className="text-center text-sm font-semibold text-navy underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <AuthFormError state={state} />
      <AuthField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state?.values?.email ?? ""}
        error={fieldError(state, "email")}
      />
      <SubmitButton pending={pending}>Send reset link</SubmitButton>
      <Link href="/auth/sign-in" className="text-center text-sm font-semibold text-navy underline underline-offset-4">
        Back to sign in
      </Link>
    </form>
  );
}

/** Sets a new password from a reset link; on success the action signs in and redirects. */
export function NewPasswordForm({ token, passwordMinLength }: { token: string; passwordMinLength: number }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  if (state && !state.ok && state.code === "not_found") {
    // The link itself is unusable; another password attempt cannot succeed.
    return (
      <div className="flex flex-col gap-6">
        <AuthFormError state={state} />
        <ButtonLink href="/auth/reset" variant="navy" size="lg" className="h-12 w-full">
          Request a new reset link
        </ButtonLink>
      </div>
    );
  }
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <AuthFormError state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        description={`Use at least ${passwordMinLength} characters.`}
        error={fieldError(state, "password")}
      />
      <SubmitButton pending={pending}>Update password</SubmitButton>
    </form>
  );
}
