"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction } from "@/server/auth/actions";
import { AuthField, AuthFormError, fieldError, PasswordField, SubmitButton } from "./fields";

export function SignInForm({ next, defaultEmail, signUpHref }: { next: string | null; defaultEmail: string; signUpHref: string }) {
  const [state, action, pending] = useActionState(signInAction, null);
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <AuthFormError state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <AuthField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state?.values?.email ?? defaultEmail}
        error={fieldError(state, "email")}
      />
      <PasswordField
        autoComplete="current-password"
        error={fieldError(state, "password")}
        labelAction={
          <Link href="/auth/reset" className="text-sm font-medium text-navy underline underline-offset-4">
            Forgot password?
          </Link>
        }
      />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
      <p className="text-center text-sm text-slate-help">
        New here?{" "}
        <Link href={signUpHref} className="font-semibold text-navy underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
