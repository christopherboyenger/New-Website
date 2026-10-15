import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Form primitives. Every control is labelled; errors are linked with
 * aria-describedby and announced (role="alert" on field errors is avoided to
 * prevent noisy announcements — the form-level error summary uses it instead).
 */

export interface FieldProps {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ id, label, description, error, optional, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">(optional)</span> : null}
      </label>
      {description ? (
        <p id={`${id}-description`} className="text-[13px] text-muted">
          {description}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** aria-describedby / aria-invalid props for a control inside <Field id=...>. */
export function describedBy(id: string, opts: { description?: boolean; error?: string | undefined }) {
  const ids = [opts.description ? `${id}-description` : null, opts.error ? `${id}-error` : null].filter(Boolean).join(" ");
  return { "aria-describedby": ids || undefined, "aria-invalid": opts.error ? true : undefined };
}

const control =
  "w-full rounded-[8px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-subtle shadow-[0_1px_0_rgb(0_0_0/0.02)] transition-colors hover:border-line-strong focus:border-ink-2 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 disabled:bg-canvas disabled:text-muted aria-invalid:border-danger";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(control, "h-9", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-9 appearance-auto pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({ className, label, ...rest }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-ink", className)}>
      <input type="checkbox" className="size-4 rounded border-line-strong accent-ink" {...rest} />
      {label}
    </label>
  );
}

/** Form-level error summary. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[10px] border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}

/** Prefix/suffix adornment wrapper, e.g. "$" … "daily average". */
export function InputAdornment({ prefix, suffix, children }: { prefix?: ReactNode; suffix?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {prefix ? <span className="text-sm text-muted">{prefix}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
      {suffix ? <span className="text-sm text-muted">{suffix}</span> : null}
    </div>
  );
}
