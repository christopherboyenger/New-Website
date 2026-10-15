"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { CatalogOption } from "@/domain/targeting-catalog";
import { describedBy, Field } from "@/components/ui/form";
import { SurfaceHelp, SurfaceLabel } from "@/components/onboarding/surface";
import { AuthField, AuthFormError, fieldError, PasswordField, SubmitButton } from "@/components/auth/fields";
import { createCreatorProfileAction, signUpCreatorAction, type CreatorFormState } from "@/server/creator/actions";

const selectClass =
  "h-12 w-full rounded-[10px] border border-slate-line bg-surface px-4 text-[15px] text-navy transition-colors hover:border-slate-help/50 focus:border-navy focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 aria-invalid:border-danger";

function CountryField({ countries, state }: { countries: CatalogOption[]; state: CreatorFormState | null }) {
  const error = fieldError(state, "country");
  return (
    <Field
      id="country"
      label={<SurfaceLabel>Country you live in</SurfaceLabel>}
      description={<SurfaceHelp>Campaigns can be limited to creators in certain countries.</SurfaceHelp>}
      error={error}
    >
      <select id="country" name="country" required defaultValue={state?.values?.country ?? ""} className={selectClass} {...describedBy("country", { description: true, error })}>
        <option value="" disabled>
          Choose a country
        </option>
        {countries.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function DisplayNameField({ state }: { state: CreatorFormState | null }) {
  return (
    <AuthField
      id="displayName"
      label="Creator name"
      description="The name brands see next to your posts."
      required
      maxLength={60}
      defaultValue={state?.values?.displayName ?? ""}
      error={fieldError(state, "displayName")}
    />
  );
}

/** New creator: login + profile in one form; the account is created through the shared auth service. */
export function CreatorSignUpForm({ countries, passwordMinLength, signInHref }: { countries: CatalogOption[]; passwordMinLength: number; signInHref: string }) {
  const [state, action, pending] = useActionState(signUpCreatorAction, null);
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <AuthFormError state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField id="firstName" label="First name" autoComplete="given-name" required maxLength={80} defaultValue={state?.values?.firstName ?? ""} error={fieldError(state, "firstName")} />
        <AuthField id="lastName" label="Last name" autoComplete="family-name" maxLength={80} defaultValue={state?.values?.lastName ?? ""} error={fieldError(state, "lastName")} />
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
        defaultValue={state?.values?.email ?? ""}
        error={fieldError(state, "email")}
      />
      <PasswordField autoComplete="new-password" description={`Use at least ${passwordMinLength} characters.`} error={fieldError(state, "password")} />
      <DisplayNameField state={state} />
      <CountryField countries={countries} state={state} />
      <SubmitButton pending={pending}>Create creator account</SubmitButton>
      <p className="text-center text-sm text-slate-help">
        Already have an account?{" "}
        <Link href={signInHref} className="font-semibold text-navy underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** Signed-in user without a creator profile (for example a brand teammate). */
export function CreatorProfileSetupForm({ countries }: { countries: CatalogOption[] }) {
  const [state, action, pending] = useActionState(createCreatorProfileAction, null);
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <AuthFormError state={state} />
      <DisplayNameField state={state} />
      <CountryField countries={countries} state={state} />
      <SubmitButton pending={pending}>Create creator profile</SubmitButton>
    </form>
  );
}
