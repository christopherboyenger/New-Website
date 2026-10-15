"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { describedBy, Field, FormError } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SurfaceHelp, SurfaceInput, SurfaceLabel } from "@/components/onboarding/surface";
import type { AuthFormState } from "@/server/auth/actions";

/** Labelled text input on the onboarding surface, with its error tied to the control. */
export function AuthField({
  id,
  label,
  description,
  error,
  className,
  ...input
}: { id: string; label: ReactNode; description?: ReactNode; error?: string; className?: string } & Omit<ComponentProps<"input">, "id">) {
  return (
    <Field id={id} className={className} label={<SurfaceLabel>{label}</SurfaceLabel>} description={description ? <SurfaceHelp>{description}</SurfaceHelp> : undefined} error={error}>
      <SurfaceInput id={id} name={id} {...input} {...describedBy(id, { description: Boolean(description), error })} />
    </Field>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordField({
  id = "password",
  label = "Password",
  description,
  error,
  autoComplete,
  labelAction,
}: {
  id?: string;
  label?: string;
  description?: ReactNode;
  error?: string;
  autoComplete: "current-password" | "new-password";
  /** Rendered beside the label, e.g. "Forgot password?". */
  labelAction?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      {labelAction ? <div className="absolute right-0 top-0">{labelAction}</div> : null}
      <Field id={id} label={<SurfaceLabel>{label}</SurfaceLabel>} description={description ? <SurfaceHelp>{description}</SurfaceHelp> : undefined} error={error}>
        <div className="relative">
          <SurfaceInput
            id={id}
            name={id}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            required
            className="pr-12"
            {...describedBy(id, { description: Boolean(description), error })}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label="Show password"
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-[10px] text-slate-help hover:text-navy"
          >
            {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </Field>
    </div>
  );
}

export function AuthHeading({ title, lead }: { title: ReactNode; lead?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-navy sm:text-[32px]">{title}</h1>
      {lead ? <p className="mt-2 text-base text-slate-help">{lead}</p> : null}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" variant="navy" size="lg" className="mt-2 h-12 w-full" loading={pending}>
      {children}
    </Button>
  );
}

/** Form-level failure summary (field-level messages are also shown on the fields). */
export function AuthFormError({ state }: { state: AuthFormState<unknown> | null }) {
  if (!state || state.ok) return null;
  return <FormError message={state.error} />;
}

export function fieldError(state: AuthFormState<unknown> | null, field: string): string | undefined {
  return state && !state.ok ? state.fieldErrors?.[field] : undefined;
}
