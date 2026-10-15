"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  previousStepKey,
  stepFields,
  stepLabels,
  stepNumber,
  TOTAL_STEPS,
  onboardingStepKeys,
  validateStep,
  withDisplayDefaults,
  type AnswerKey,
  type OnboardingAnswers,
  type OnboardingStepKey,
} from "@/domain/onboarding";
import { findTemplate } from "@/domain/playbook-templates";
import type { PaymentReadiness } from "@/server/billing/payment-setup";
import type { Forecast } from "@/server/forecast";
import { completeOnboardingAction, estimateReachAction, saveOnboardingStepAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { PaymentStep } from "./payment-step";
import {
  BillingStep,
  BrandStep,
  BudgetStep,
  FormatStep,
  OverviewStep,
  ReferralStep,
  RoleStep,
  SummaryStep,
  TemplateStep,
  type ForecastLoad,
  type StepProps,
} from "./steps";

export interface OnboardingWizardProps {
  productName: string;
  initial: {
    step: OnboardingStepKey;
    answers: OnboardingAnswers;
    /** The next save replaces a completed draft (`/onboarding?new=1`). */
    startNew: boolean;
    payment: PaymentReadiness | null;
    forecast: Forecast;
  };
}

const FORM_ID = "onboarding-step-form";
const FORECAST_DEBOUNCE_MS = 400;

/**
 * Brand onboarding wizard. Every Next saves the current screen on the server
 * (which re-validates it and returns the screen to show); Back only moves
 * the view and keeps unsaved edits. Next is disabled with the reason shown
 * beside it until the screen is valid.
 */
export function OnboardingWizard({ productName, initial }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStepKey>(initial.step);
  const [answers, setAnswers] = useState<OnboardingAnswers>(initial.answers);
  const [startNew, setStartNew] = useState(initial.startNew);
  const [payment, setPayment] = useState<PaymentReadiness | null>(initial.payment);
  const [forecast, setForecast] = useState<Forecast>(initial.forecast);
  const [forecastLoad, setForecastLoad] = useState<ForecastLoad>("idle");
  const [touched, setTouched] = useState<Partial<Record<AnswerKey, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<AnswerKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [clearedTemplateName, setClearedTemplateName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const navigated = useRef(false);

  const values = withDisplayDefaults(answers);
  const validation = validateStep(step, values);

  const visibleErrors: Partial<Record<AnswerKey, string>> = { ...serverErrors };
  for (const [field, message] of Object.entries(validation.fieldErrors)) {
    if (touched[field as AnswerKey] && !visibleErrors[field as AnswerKey]) visibleErrors[field as AnswerKey] = message;
  }

  // Move focus to the new screen's heading after Back/Next (not on first load).
  useEffect(() => {
    if (!navigated.current) return;
    window.scrollTo({ top: 0 });
    document.getElementById("onboarding-step-title")?.focus();
  }, [step]);

  // Re-request the reach estimate when the budget changes (debounced).
  const budgetCents = values.dailyBudgetCents;
  const budgetValid = step === "budget" && validation.valid;
  useEffect(() => {
    if (!budgetValid || budgetCents === undefined) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setForecastLoad("loading");
      const result = await estimateReachAction({ dailyBudgetCents: budgetCents }).catch(() => null);
      if (cancelled) return;
      if (result?.ok) {
        setForecast(result.data);
        setForecastLoad("idle");
      } else {
        setForecastLoad("error");
      }
    }, FORECAST_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [budgetCents, budgetValid]);

  function goTo(next: OnboardingStepKey) {
    navigated.current = true;
    setFormError(null);
    setServerErrors({});
    setTouched({});
    setStep(next);
  }

  function change(patch: OnboardingAnswers) {
    setAnswers((current) => ({ ...current, ...patch }));
    setFormError(null);
    setServerErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key as AnswerKey];
      return next;
    });
  }

  function touch(field: AnswerKey) {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validation.valid || step === "payment") return;
    const submitted: Record<string, unknown> = {};
    for (const key of stepFields[step]) if (values[key] !== undefined) submitted[key] = values[key];
    const templateBefore = findTemplate(answers.templateId);

    startTransition(async () => {
      const result = await saveOnboardingStepAction({ step, answers: submitted, startNew });
      if (!result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      if (step === "format") setClearedTemplateName(templateBefore && !result.data.answers.templateId ? templateBefore.name : null);
      if (step === "template") setClearedTemplateName(null);
      setAnswers(result.data.answers);
      setPayment(result.data.payment);
      setStartNew(false);
      goTo(result.data.step);
    });
  }

  function complete(deferPayment: boolean) {
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction({ deferPayment });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      router.push(result.data.redirectTo);
    });
  }

  const back = previousStepKey(step);
  const isPayment = step === "payment";
  const finishReady = payment?.status === "ready";
  const hint = isPayment ? (finishReady ? null : "Add a payment method to finish, or choose “I’ll finish later”.") : validation.reason;
  const stepProps: StepProps = { values, onChange: change, errors: visibleErrors, onTouch: touch };

  return (
    <>
      <main className="flex flex-1 justify-center px-4 py-10 sm:px-7 sm:py-14 lg:items-center">
        <form id={FORM_ID} onSubmit={submit} noValidate className="flex w-full justify-center" aria-labelledby="onboarding-step-title">
          {step === "role" ? (
            <RoleStep {...stepProps} />
          ) : step === "overview" ? (
            <OverviewStep productName={productName} />
          ) : step === "referral" ? (
            <ReferralStep {...stepProps} productName={productName} />
          ) : step === "brand" ? (
            <BrandStep {...stepProps} />
          ) : step === "budget" ? (
            <BudgetStep {...stepProps} forecast={forecast} forecastLoad={forecastLoad} />
          ) : step === "summary" ? (
            <SummaryStep values={values} forecast={forecast} onEdit={goTo} />
          ) : step === "format" ? (
            <FormatStep {...stepProps} />
          ) : step === "template" ? (
            <TemplateStep {...stepProps} clearedTemplateName={clearedTemplateName} />
          ) : step === "billing" ? (
            <BillingStep {...stepProps} />
          ) : (
            <PaymentStep
              payment={payment}
              thresholdCents={values.billingThresholdCents ?? 0}
              busy={pending}
              onPaymentChange={setPayment}
              onFinishLater={() => complete(true)}
            />
          )}
        </form>
      </main>

      {/* Sticky from the sm breakpoint; on phones it follows the content so it never covers fields or sits above the keyboard. */}
      <footer className="border-t border-slate-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:sticky sm:bottom-0 sm:z-10 sm:border-t-0 sm:bg-surface/95 sm:px-7 sm:pb-6 sm:pt-0 sm:backdrop-blur">
        <StepProgress step={step} />
        <div className="mt-3 flex flex-col gap-3 sm:mt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4 sm:justify-start">
            {back ? (
              <button
                type="button"
                onClick={() => goTo(back)}
                disabled={pending}
                className="inline-flex min-h-11 items-center text-[15px] font-semibold text-navy underline underline-offset-4 disabled:opacity-50 sm:min-h-0"
              >
                Back
              </button>
            ) : (
              <span />
            )}
            <p className="text-sm text-slate-help sm:sr-only" aria-hidden="true">
              Step {stepNumber(step)} of {TOTAL_STEPS}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            {formError ? (
              <p id="onboarding-next-error" role="alert" className="text-sm text-danger sm:max-w-md sm:text-right">
                {formError}
              </p>
            ) : hint ? (
              <p id="onboarding-next-hint" className="text-sm text-slate-help sm:max-w-md sm:text-right">
                {hint}
              </p>
            ) : null}
            {isPayment ? (
              <Button
                variant="navy"
                size="lg"
                className="w-full sm:w-auto sm:min-w-28"
                disabled={!finishReady}
                loading={pending}
                onClick={() => complete(false)}
                aria-describedby={formError ? "onboarding-next-error" : hint ? "onboarding-next-hint" : undefined}
              >
                Finish
              </Button>
            ) : (
              <Button
                type="submit"
                form={FORM_ID}
                variant={step === "overview" ? "accent" : "navy"}
                size="lg"
                className="w-full sm:w-auto sm:min-w-28"
                disabled={!validation.valid}
                loading={pending}
                aria-describedby={formError ? "onboarding-next-error" : hint ? "onboarding-next-hint" : undefined}
              >
                {step === "overview" ? "Get Started" : "Next"}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </>
  );
}

/** Segmented progress (dark = done/current, pale = remaining) with a textual equivalent. */
function StepProgress({ step }: { step: OnboardingStepKey }) {
  const current = stepNumber(step);
  return (
    <div
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-valuenow={current}
      aria-valuetext={`Step ${current} of ${TOTAL_STEPS}: ${stepLabels[step]}`}
      className="flex gap-1 sm:gap-1.5"
    >
      {onboardingStepKeys.map((key, i) => (
        <span key={key} className={cn("h-[3px] flex-1 rounded-full", i < current ? "bg-navy" : "bg-slate-line/60")} />
      ))}
    </div>
  );
}
