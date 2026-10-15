"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { BUDGET_BANDS, FIELD_LIMITS, JOB_FUNCTIONS, JOB_LEVELS, type LeadRoute } from "@/domain/lead";
import { chooseLeadRoute, submitLeadDetails, submitLeadEmail } from "@/server/leads";
import { cn } from "@/lib/cn";

export interface FunnelValues {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  companyWebsite: string;
  budgetBand: string;
  jobLevel: string;
  jobFunction: string;
  notes: string;
}

type DetailKey = Exclude<keyof FunnelValues, "email">;

const EMPTY: FunnelValues = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  companyName: "",
  companyWebsite: "",
  budgetBand: "",
  jobLevel: "",
  jobFunction: "",
  notes: "",
};

const control =
  "w-full rounded-[8px] border border-slate-line bg-white px-4 text-[15px] text-navy placeholder:text-slate-help/80 transition-colors hover:border-slate-help/50 focus:border-navy focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 aria-invalid:border-danger";

/**
 * Three-step acquisition modal (A02–A03 visual): work email → "Tell us about
 * your brand" → "Choose how to start". Each step is saved by a Server Action
 * before moving on; Close and Escape return to the page the visitor came from.
 */
export function StartFunnel({
  cta,
  sales,
  bookingAvailable,
  returnTo,
  initial,
}: {
  cta: string | null;
  sales: boolean;
  bookingAvailable: boolean;
  returnTo: string;
  initial: FunnelValues | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [values, setValues] = useState<FunnelValues>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingRoute, setPendingRoute] = useState<LeadRoute | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    headingRef.current?.focus();
    scrollRef.current?.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) router.push(returnTo);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, returnTo]);

  function set<K extends keyof FunnelValues>(key: K, value: FunnelValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key])
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
  }

  function goTo(next: 1 | 2 | 3) {
    setErrors({});
    setFormError(null);
    setStep(next);
  }

  function submitEmail(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await submitLeadEmail({ email: values.email, cta });
      if (result.ok) {
        setValues((v) => ({ ...v, email: result.data.email }));
        goTo(2);
      } else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? null : result.error);
      }
    });
  }

  function submitDetails(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await submitLeadDetails(detailsOf(values));
      if (result.ok) {
        goTo(3);
      } else if (result.code === "conflict") {
        goTo(1);
        setFormError(result.error);
      } else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      }
    });
  }

  function choose(route: LeadRoute) {
    setPendingRoute(route);
    setFormError(null);
    startTransition(async () => {
      const result = await chooseLeadRoute({ route });
      if (!result.ok) {
        setPendingRoute(null);
        if (result.code === "conflict") goTo(1);
        setFormError(result.error);
        return;
      }
      if (/^https?:\/\//i.test(result.data.destination)) window.location.assign(result.data.destination);
      else router.push(result.data.destination);
    });
  }

  return (
    <div className="fixed inset-0 z-10 flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4">
      <div
        ref={scrollRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full overflow-y-auto overscroll-contain bg-white text-navy shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-[600px] sm:rounded-[20px]"
      >
        <div className="px-5 pt-8 pb-8 sm:px-10 sm:pt-11 sm:pb-10">
          <Link
            href={returnTo}
            aria-label="Close"
            className="absolute top-5 right-5 grid size-11 place-items-center rounded-[8px] bg-accent-soft text-accent transition-colors hover:bg-[#ffe3dd] sm:top-8 sm:right-8 sm:size-10"
          >
            <X className="size-4" aria-hidden="true" />
          </Link>

          <p className="text-xs font-medium tracking-[0.18em] text-accent uppercase">Step {step} of 3</p>
          <h1 id={titleId} ref={headingRef} tabIndex={-1} className="mt-2 pr-12 text-[28px] leading-tight font-medium tracking-tight focus:outline-none sm:text-[32px]">
            {step === 1 ? "Start with your work email" : step === 2 ? "Tell us about your brand" : "Choose how to start"}
          </h1>

          {formError ? (
            <div role="alert" className="mt-5 rounded-[10px] border border-danger-line bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
              {formError}
            </div>
          ) : null}

          {step === 1 ? (
            <form onSubmit={submitEmail} noValidate className="mt-6 flex flex-col gap-6">
              <p className="text-[15px] leading-relaxed text-slate-help">We&apos;ll use it to save your answers and set up your account if you continue.</p>
              <FunnelField id="lead-email" label="Work email" error={errors.email}>
                <input
                  id="lead-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  maxLength={FIELD_LIMITS.email}
                  placeholder="name@yourbrand.com"
                  value={values.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={cn(control, "h-12")}
                  {...errorProps("lead-email", errors.email)}
                />
              </FunnelField>
              <SubmitButton pending={pending}>Continue</SubmitButton>
              <p className="text-center text-sm text-slate-help">
                Already have an account?{" "}
                <Link href="/auth/sign-in" className="font-medium text-navy underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </form>
          ) : null}

          {step === 2 ? (
            <form onSubmit={submitDetails} noValidate className="mt-6 flex flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
                <TextField id="firstName" label="First name" autoComplete="given-name" maxLength={FIELD_LIMITS.name} values={values} errors={errors} onChange={set} />
                <TextField id="lastName" label="Last name" autoComplete="family-name" maxLength={FIELD_LIMITS.name} values={values} errors={errors} onChange={set} />
              </div>
              <TextField
                id="phone"
                label="Phone number"
                type="tel"
                autoComplete="tel"
                placeholder="Enter your phone number"
                maxLength={FIELD_LIMITS.phone}
                values={values}
                errors={errors}
                onChange={set}
              />
              <TextField id="companyName" label="Company name" autoComplete="organization" placeholder="Your brand" maxLength={FIELD_LIMITS.companyName} values={values} errors={errors} onChange={set} />
              <TextField
                id="companyWebsite"
                label="Company website"
                inputMode="url"
                autoComplete="url"
                placeholder="yourbrand.com"
                maxLength={FIELD_LIMITS.companyWebsite}
                values={values}
                errors={errors}
                onChange={set}
              />

              <fieldset aria-describedby={errors.budgetBand ? "budgetBand-error" : undefined}>
                <legend className="mb-2 text-sm font-medium">Monthly marketing budget</legend>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_BANDS.map((band) => (
                    <label
                      key={band}
                      className={cn(
                        "inline-flex h-11 cursor-pointer items-center rounded-[8px] border border-slate-line px-4 text-[15px] transition-colors hover:border-slate-help/50",
                        "has-[:checked]:border-navy has-[:checked]:bg-slate-fill has-[:checked]:ring-1 has-[:checked]:ring-navy",
                        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                      )}
                    >
                      <input
                        type="radio"
                        name="budgetBand"
                        value={band}
                        checked={values.budgetBand === band}
                        onChange={() => set("budgetBand", band)}
                        className="sr-only"
                      />
                      {band}
                    </label>
                  ))}
                </div>
                {errors.budgetBand ? (
                  <p id="budgetBand-error" className="mt-1.5 text-[13px] text-danger">
                    {errors.budgetBand}
                  </p>
                ) : null}
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
                <SelectField id="jobLevel" label="Job level" placeholder="Select a job level" options={JOB_LEVELS} values={values} errors={errors} onChange={set} />
                <SelectField id="jobFunction" label="Job function" placeholder="Select a job function" options={JOB_FUNCTIONS} values={values} errors={errors} onChange={set} />
              </div>

              <FunnelField id="notes" label="Anything else? (optional)" error={errors.notes}>
                <textarea
                  id="notes"
                  rows={4}
                  maxLength={FIELD_LIMITS.notes}
                  placeholder="Tell us more about your project, needs, and timeline"
                  value={values.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className={cn(control, "min-h-24 resize-y py-3 leading-relaxed")}
                  {...errorProps("notes", errors.notes)}
                />
              </FunnelField>

              <SubmitButton pending={pending}>Continue</SubmitButton>
              <BackButton onClick={() => goTo(1)} />
            </form>
          ) : null}

          {step === 3 ? (
            <div className="mt-3 flex flex-col gap-4">
              <p className="text-[15px] leading-relaxed text-slate-help">Based on what you told us, here is where we would take you next.</p>
              {sales && !bookingAvailable ? (
                <p role="status" className="rounded-[10px] border border-slate-line bg-slate-fill px-4 py-3 text-sm leading-relaxed text-navy-2">
                  Your details are saved, so our team can follow up with you at <span className="font-medium">{values.email}</span>. You can also get started on
                  your own now.
                </p>
              ) : null}
              <div className="flex flex-col gap-3">
                {sales && bookingAvailable ? (
                  <RouteCard title="Book a call" description="Pick a time to talk with our team." pending={pendingRoute === "book_call"} disabled={pending} onClick={() => choose("book_call")} />
                ) : null}
                <RouteCard
                  title="Self-serve sign up"
                  description="Create your account, build a playbook and go live when you're ready."
                  pending={pendingRoute === "self_serve"}
                  disabled={pending}
                  onClick={() => choose("self_serve")}
                />
                <RouteCard
                  title="Read how it works"
                  description="Five steps from brief to Paid Ads."
                  pending={pendingRoute === "learn"}
                  disabled={pending}
                  onClick={() => choose("learn")}
                />
              </div>
              <BackButton onClick={() => goTo(2)} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function detailsOf(values: FunnelValues): Record<DetailKey, string> {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    companyName: values.companyName,
    companyWebsite: values.companyWebsite,
    budgetBand: values.budgetBand,
    jobLevel: values.jobLevel,
    jobFunction: values.jobFunction,
    notes: values.notes,
  };
}

function errorProps(id: string, error: string | undefined) {
  return { "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined };
}

function FunnelField({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface FieldBinding {
  values: FunnelValues;
  errors: Record<string, string>;
  onChange: (key: DetailKey, value: string) => void;
}

function TextField({
  id,
  label,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
  values,
  errors,
  onChange,
}: FieldBinding & {
  id: DetailKey;
  label: string;
  type?: "text" | "tel";
  placeholder?: string;
  autoComplete: string;
  inputMode?: "url";
  maxLength: number;
}) {
  return (
    <FunnelField id={id} label={label} error={errors[id]}>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        required
        placeholder={placeholder}
        value={values[id]}
        onChange={(e) => onChange(id, e.target.value)}
        className={cn(control, "h-12")}
        {...errorProps(id, errors[id])}
      />
    </FunnelField>
  );
}

function SelectField({
  id,
  label,
  placeholder,
  options,
  values,
  errors,
  onChange,
}: FieldBinding & { id: DetailKey; label: string; placeholder: string; options: readonly string[] }) {
  return (
    <FunnelField id={id} label={label} error={errors[id]}>
      <select
        id={id}
        name={id}
        required
        value={values[id]}
        onChange={(e) => onChange(id, e.target.value)}
        className={cn(control, "h-12 appearance-auto pr-3", !values[id] && "text-slate-help/80")}
        {...errorProps(id, errors[id])}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option} value={option} className="text-navy">
            {option}
          </option>
        ))}
      </select>
    </FunnelField>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="mt-1 inline-flex h-12 w-full items-center justify-center rounded-[8px] bg-accent text-[15px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-slate-help hover:text-navy">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back
    </button>
  );
}

function RouteCard({ title, description, pending, disabled, onClick }: { title: string; description: string; pending: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={pending || undefined}
      className="group flex w-full items-center gap-4 rounded-[12px] border border-slate-line px-6 py-6 text-left transition-colors hover:border-navy disabled:cursor-wait disabled:opacity-70"
    >
      <span className="flex-1">
        <span className="block text-lg font-medium">{title}</span>
        <span className="mt-1.5 block text-[15px] text-slate-help">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-slate-help transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}
