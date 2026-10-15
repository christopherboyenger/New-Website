"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction } from "@/server/auth/actions";
import { AuthField, AuthFormError, fieldError, PasswordField, SubmitButton } from "./fields";

export function SignUpForm({
  next,
  defaultEmail,
  signInHref,
  passwordMinLength,
}: {
  next: string | null;
  defaultEmail: string;
  signInHref: string;
  passwordMinLength: number;
}) {
  const [state, action, pending] = useActionState(signUpAction, null);
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <AuthFormError state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField
          id="firstName"
          label="First name"
          autoComplete="given-name"
          required
          maxLength={80}
          defaultValue={state?.values?.firstName ?? ""}
          error={fieldError(state, "firstName")}
        />
        <AuthField
          id="lastName"
          label="Last name"
          autoComplete="family-name"
          maxLength={80}
          defaultValue={state?.values?.lastName ?? ""}
          error={fieldError(state, "lastName")}
        />
      </div>
      <AuthField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={254}
        defaultValue={state?.values?.email ?? defaultEmail}
        error={fieldError(state, "email")}
      />
      <PasswordField autoComplete="new-password" description={`Use at least ${passwordMinLength} characters.`} error={fieldError(state, "password")} />
      <SubmitButton pending={pending}>Create account</SubmitButton>
      <p className="text-center text-sm text-slate-help">
        Already have an account?{" "}
        <Link href={signInHref} className="font-semibold text-navy underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
