"use client";

import { useId, useState, type ReactNode } from "react";
import { Hand, LineChart, Rocket } from "lucide-react";
import { paymentSetupDisclosure } from "@/config/commercial-policy";
import {
  billingThresholdOptions,
  BRAND_DESCRIPTION_MAX,
  BRAND_NAME_MAX,
  BRAND_WEBSITE_MAX,
  BUDGET_MAX_CENTS,
  BUDGET_MIN_CENTS,
  BUDGET_SLIDER_STEP_CENTS,
  formatDescriptions,
  REFERRAL_CODE_MAX,
  REFERRAL_DETAIL_MAX,
  referralKeys,
  referralLabels,
  roleKeys,
  roleLabels,
  type AnswerKey,
  type OnboardingAnswers,
  type OnboardingStepKey,
} from "@/domain/onboarding";
import { contentFormatLabels, contentFormats } from "@/domain/playbook-content";
import { findTemplate, templatesForFormat } from "@/domain/playbook-templates";
import type { Forecast } from "@/server/forecast";
import { ChoiceCardGroup } from "@/components/ui/choice-card";
import { describedBy, Field } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/feedback";
import { formatCount, formatUsd } from "@/lib/money";
import { cn } from "@/lib/cn";
import { FormatArt, PlanArt, TemplateArt, WelcomeArt } from "./illustrations";
import { StepHeading, StepLead, SurfaceHelp, SurfaceInput, SurfaceLabel, SurfaceTextarea } from "./surface";

/**
 * The wizard's screens. Each is a controlled view over the shared answers;
 * saving, navigation and validation gating live in ./wizard.tsx.
 */

export interface StepProps {
  /** Answers with display defaults applied (budget, threshold). */
  values: OnboardingAnswers;
  onChange: (patch: OnboardingAnswers) => void;
  /** Visible field errors, keyed by answer field. */
  errors: Partial<Record<AnswerKey, string>>;
  /** Marks a text field as visited so its validation message may show. */
  onTouch: (field: AnswerKey) => void;
}

/* ----------------------------------------------------------------------------
 * 1 · Role
 * ------------------------------------------------------------------------- */

export function RoleStep({ values, onChange }: StepProps) {
  return (
    <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <StepHeading>What best describes your role?</StepHeading>
        <StepLead>We’ll use this to tailor your workspace.</StepLead>
        <ChoiceCardGroup
          className="mt-8"
          name="role"
          legend="Your role"
          legendHidden
          columns={2}
          value={values.role ?? null}
          onChange={(role) => onChange({ role: role as OnboardingAnswers["role"] })}
          options={roleKeys.map((key) => ({
            value: key,
            label: <span className="flex min-h-14 items-center text-base font-medium sm:min-h-[72px]">{roleLabels[key]}</span>,
          }))}
        />
      </div>
      <WelcomeArt className="mx-auto hidden max-w-[360px] lg:block" />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 2 · Overview
 * ------------------------------------------------------------------------- */

const overviewRows = [
  { title: "Tell us about your brand", body: "Share the basics of your brand and what your goals are", icon: Hand },
  { title: "Set your budget", body: "Define your budget to help us tailor the experience", icon: LineChart },
  { title: "Publish your first playbook", body: "Once you publish, creators will start posting your content across social media", icon: Rocket },
];

export function OverviewStep({ productName }: { productName: string }) {
  return (
    <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <StepHeading className="text-[34px] sm:text-[44px] lg:text-[48px] lg:leading-[1.05]">It’s easy to get started on {productName}</StepHeading>
      <ol className="flex flex-col">
        {overviewRows.map((row, i) => (
          <li key={row.title} className="flex items-start gap-4 border-slate-line py-5 not-last:border-b">
            <span className="w-4 shrink-0 pt-0.5 text-lg font-semibold text-navy" aria-hidden="true">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-navy">{row.title}</h2>
              <p className="mt-2 text-[15px] text-slate-help">{row.body}</p>
            </div>
            <span className="grid size-16 shrink-0 place-items-center rounded-[12px] bg-slate-fill sm:size-24" aria-hidden="true">
              <row.icon className="size-7 text-accent" />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 3 · Referral
 * ------------------------------------------------------------------------- */

function RadioRowLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-3 font-medium">
      <span
        aria-hidden="true"
        className="size-[18px] shrink-0 rounded-full border-[1.5px] border-navy bg-surface transition-[border-width] group-has-[:checked]:border-[5px]"
      />
      {children}
    </span>
  );
}

export function ReferralStep({ values, onChange, errors, onTouch, productName }: StepProps & { productName: string }) {
  function choose(source: string) {
    onChange({ referralSource: source as OnboardingAnswers["referralSource"] });
    // Reveal the follow-up field without moving focus out of the radio group.
    if (source === "code" || source === "other") {
      // "end" honors the wrapper's scroll margin, which keeps the field clear of the sticky footer.
      requestAnimationFrame(() => document.getElementById("referral-follow-up")?.scrollIntoView({ block: "end" }));
    }
  }
  return (
    <div className="w-full max-w-[480px]">
      <StepHeading>Where did you hear about {productName}?</StepHeading>
      <StepLead>Let us know what’s working</StepLead>
      <ChoiceCardGroup
        className="mt-8 [&_label]:py-3"
        name="referralSource"
        legend={`Where did you hear about ${productName}?`}
        legendHidden
        columns={1}
        value={values.referralSource ?? null}
        onChange={choose}
        options={referralKeys.map((key) => ({ value: key, label: <RadioRowLabel>{referralLabels[key]}</RadioRowLabel> }))}
      />
      <div id="referral-follow-up" className="scroll-mb-48">
        <ReferralFollowUp values={values} onChange={onChange} errors={errors} onTouch={onTouch} />
      </div>
    </div>
  );
}

function ReferralFollowUp({ values, onChange, errors, onTouch }: StepProps) {
  return (
    <>
      {values.referralSource === "code" ? (
        <Field
          id="referralCode"
          className="mt-5"
          label={<SurfaceLabel>Your code</SurfaceLabel>}
          description={<SurfaceHelp>Letters, numbers, dashes or underscores.</SurfaceHelp>}
          error={errors.referralCode}
        >
          <SurfaceInput
            id="referralCode"
            name="referralCode"
            autoComplete="off"
            maxLength={REFERRAL_CODE_MAX}
            value={values.referralCode ?? ""}
            onChange={(e) => onChange({ referralCode: e.target.value })}
            onBlur={() => onTouch("referralCode")}
            {...describedBy("referralCode", { description: true, error: errors.referralCode })}
          />
        </Field>
      ) : null}
      {values.referralSource === "other" ? (
        <Field id="referralDetail" className="mt-5" label={<SurfaceLabel>Where did you hear about us?</SurfaceLabel>} optional error={errors.referralDetail}>
          <SurfaceInput
            id="referralDetail"
            name="referralDetail"
            maxLength={REFERRAL_DETAIL_MAX}
            value={values.referralDetail ?? ""}
            onChange={(e) => onChange({ referralDetail: e.target.value })}
            onBlur={() => onTouch("referralDetail")}
            {...describedBy("referralDetail", { error: errors.referralDetail })}
          />
        </Field>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------------------
 * 4 · Brand basics
 * ------------------------------------------------------------------------- */

export function BrandStep({ values, onChange, errors, onTouch }: StepProps) {
  const description = values.brandDescription ?? "";
  return (
    <div className="w-full max-w-[640px]">
      <StepHeading>Tell us about your brand</StepHeading>
      <div className="mt-9 flex flex-col gap-7">
        <Field id="brandName" label={<SurfaceLabel>Brand Name</SurfaceLabel>} error={errors.brandName}>
          <SurfaceInput
            id="brandName"
            name="brandName"
            autoComplete="organization"
            maxLength={BRAND_NAME_MAX}
            value={values.brandName ?? ""}
            onChange={(e) => onChange({ brandName: e.target.value })}
            onBlur={() => onTouch("brandName")}
            {...describedBy("brandName", { error: errors.brandName })}
          />
        </Field>
        <Field
          id="brandWebsite"
          label={<SurfaceLabel>Your website</SurfaceLabel>}
          description={<SurfaceHelp>Don’t have one? An App Store link is also ok!</SurfaceHelp>}
          error={errors.brandWebsite}
        >
          <SurfaceInput
            id="brandWebsite"
            name="brandWebsite"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourbrand.com"
            maxLength={BRAND_WEBSITE_MAX}
            value={values.brandWebsite ?? ""}
            onChange={(e) => onChange({ brandWebsite: e.target.value })}
            onBlur={() => onTouch("brandWebsite")}
            {...describedBy("brandWebsite", { description: true, error: errors.brandWebsite })}
          />
        </Field>
        <Field
          id="brandDescription"
          label={<SurfaceLabel>Brand Description</SurfaceLabel>}
          description={<SurfaceHelp>A short description helps us recommend better content and templates for your brand</SurfaceHelp>}
          error={errors.brandDescription}
        >
          <SurfaceTextarea
            id="brandDescription"
            name="brandDescription"
            rows={2}
            maxLength={BRAND_DESCRIPTION_MAX}
            placeholder="e.g., ‘Fern & Field is a direct-to-consumer houseplant brand’"
            value={description}
            onChange={(e) => onChange({ brandDescription: e.target.value })}
            onBlur={() => onTouch("brandDescription")}
            {...describedBy("brandDescription", { description: true, error: errors.brandDescription })}
          />
          <p className="self-end text-xs text-slate-help" aria-hidden="true">
            {description.length}/{BRAND_DESCRIPTION_MAX}
          </p>
        </Field>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 5 · Budget
 * ------------------------------------------------------------------------- */

export type ForecastLoad = "idle" | "loading" | "error";

export function BudgetStep({ values, onChange, errors, onTouch, forecast, forecastLoad }: StepProps & { forecast: Forecast; forecastLoad: ForecastLoad }) {
  const cents = values.dailyBudgetCents ?? BUDGET_MIN_CENTS;
  const [text, setText] = useState(() => String(cents / 100));
  const sliderId = useId();
  const sliderValue = Math.min(BUDGET_MAX_CENTS, Math.max(BUDGET_MIN_CENTS, cents)) / 100;

  function setFromText(raw: string) {
    setText(raw);
    const trimmed = raw.trim().replace(/[$,\s]/g, "");
    const dollars = trimmed === "" ? NaN : Number(trimmed);
    onChange({ dailyBudgetCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : undefined });
  }

  return (
    <div className="w-full max-w-[560px] text-center">
      <StepHeading>Set your daily budget</StepHeading>
      <StepLead>This becomes the average daily budget of your first campaign.</StepLead>

      <p className="mt-10 text-[17px] text-navy">
        <output htmlFor={`${sliderId} dailyBudget`} className="text-[28px] font-bold tabular-nums">
          {Number.isFinite(cents) ? formatUsd(cents, { decimals: cents % 100 === 0 ? 0 : 2 }) : "—"}
        </output>{" "}
        daily budget
      </p>

      <div className="mt-6">
        <label htmlFor={sliderId} className="sr-only">
          Daily budget slider
        </label>
        <input
          id={sliderId}
          type="range"
          min={BUDGET_MIN_CENTS / 100}
          max={BUDGET_MAX_CENTS / 100}
          step={BUDGET_SLIDER_STEP_CENTS / 100}
          value={sliderValue}
          aria-valuetext={`${formatUsd(sliderValue * 100)} per day`}
          onChange={(e) => {
            const dollars = Number(e.target.value);
            setText(String(dollars));
            onChange({ dailyBudgetCents: dollars * 100 });
          }}
          className="h-11 w-full cursor-pointer accent-accent"
        />
        <div className="flex justify-between text-xs text-slate-help" aria-hidden="true">
          <span>{formatUsd(BUDGET_MIN_CENTS)}</span>
          <span>{formatUsd(BUDGET_MAX_CENTS)}</span>
        </div>
      </div>

      <Field
        id="dailyBudget"
        className="mx-auto mt-6 max-w-[240px] text-left"
        label={<SurfaceLabel>Daily budget (USD)</SurfaceLabel>}
        description={<SurfaceHelp>Whole dollars, {formatUsd(BUDGET_MIN_CENTS)} minimum.</SurfaceHelp>}
        error={errors.dailyBudgetCents}
      >
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[15px] text-slate-help" aria-hidden="true">
            $
          </span>
          <SurfaceInput
            id="dailyBudget"
            name="dailyBudget"
            inputMode="numeric"
            autoComplete="off"
            className="pl-8 tabular-nums"
            value={text}
            onChange={(e) => setFromText(e.target.value)}
            onBlur={() => onTouch("dailyBudgetCents")}
            {...describedBy("dailyBudget", { description: true, error: errors.dailyBudgetCents })}
          />
        </div>
      </Field>

      <ForecastPanel forecast={forecast} load={forecastLoad} />

      <p className="mx-auto mt-4 max-w-[448px] rounded-[12px] border border-slate-line bg-slate-fill px-5 py-3.5 text-sm text-slate-help">
        Your daily budget is an average target, not an upfront charge. {paymentSetupDisclosure()}
      </p>
    </div>
  );
}

function ForecastPanel({ forecast, load }: { forecast: Forecast; load: ForecastLoad }) {
  return (
    <section aria-label="Reach estimate" aria-busy={load === "loading"} aria-live="polite" className="mx-auto mt-8 max-w-[448px] text-left">
      {load === "error" ? (
        <InlineAlert tone="warning" title="Reach estimate unavailable">
          The estimate couldn’t be loaded right now. Your budget choice still saves.
        </InlineAlert>
      ) : forecast.status === "unavailable" ? (
        <div className="rounded-[12px] border border-dashed border-slate-line px-5 py-3.5 text-sm">
          <p className="font-semibold text-navy">Reach estimate unavailable</p>
          <p className="mt-0.5 text-slate-help">{unavailableDetail(forecast.reason)}</p>
        </div>
      ) : (
        <div className="rounded-[12px] border border-slate-line px-5 py-3.5 text-sm">
          <p className="font-semibold text-navy">
            Estimated {formatRange(forecast.monthlyViews)} views over {forecast.periodDays} days, from {formatRange(forecast.creators)} creators
          </p>
          <ul className="mt-2 list-disc pl-5 text-slate-help">
            {forecast.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-help">
            An estimate, not a guarantee. Model {forecast.modelVersion}, generated {new Date(forecast.generatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}.
          </p>
        </div>
      )}
    </section>
  );
}

/** The forecast service's reason without a repeated "Reach estimate unavailable" lead-in. */
function unavailableDetail(reason: string): string {
  const detail = reason.replace(/^reach estimate unavailable\s*[—–:-]?\s*/i, "");
  return detail ? detail.charAt(0).toUpperCase() + detail.slice(1) : "No forecast is available for this budget.";
}

function formatRange(range: { low: number; high: number }): string {
  return range.low === range.high ? formatCount(range.low) : `${formatCount(range.low)}–${formatCount(range.high)}`;
}

/* ----------------------------------------------------------------------------
 * 6 · Summary
 * ------------------------------------------------------------------------- */

export function SummaryStep({ values, forecast, onEdit }: { values: OnboardingAnswers; forecast: Forecast; onEdit: (step: OnboardingStepKey) => void }) {
  const rows: Array<{ label: string; value: ReactNode; step?: OnboardingStepKey }> = [
    { label: "Brand", value: values.brandName, step: "brand" },
    { label: "Website or app", value: <span className="break-all">{values.brandWebsite}</span>, step: "brand" },
    { label: "Description", value: values.brandDescription, step: "brand" },
    { label: "Daily budget", value: values.dailyBudgetCents ? `${formatUsd(values.dailyBudgetCents)} average per day` : "—", step: "budget" },
    {
      label: "Reach estimate",
      value: forecast.status === "available" ? `${formatRange(forecast.monthlyViews)} views over ${forecast.periodDays} days (estimate)` : "Unavailable",
    },
  ];
  return (
    <div className="w-full max-w-[640px]">
      <PlanArt className="mx-auto mb-8 max-w-[360px]" />
      <StepHeading>Here’s your plan so far</StepHeading>
      <StepLead>It’s all about content. Next, set up your first playbook so creators know what to post about you.</StepLead>
      <dl className="mt-8 divide-y divide-slate-line rounded-[12px] border border-slate-line">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-start sm:gap-4">
            <dt className="text-sm text-slate-help sm:w-32 sm:shrink-0 sm:pt-0.5">{row.label}</dt>
            <dd className="flex min-w-0 flex-1 items-start justify-between gap-4 text-[15px] text-navy">
              <span className="min-w-0">{row.value}</span>
              {row.step ? (
                <button
                  type="button"
                  onClick={onEdit.bind(null, row.step)}
                  className="-my-2 inline-flex min-h-11 shrink-0 items-center rounded-md px-1 text-sm font-medium text-navy underline underline-offset-4 sm:my-0 sm:min-h-0"
                >
                  Change<span className="sr-only"> {row.label.toLowerCase()}</span>
                </button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 7 · Content format
 * ------------------------------------------------------------------------- */

export function FormatStep({ values, onChange }: StepProps) {
  const chosenTemplate = findTemplate(values.templateId);
  const willClear = chosenTemplate && values.format && chosenTemplate.format !== values.format;
  return (
    <div className="w-full max-w-[640px]">
      <StepHeading>Choose a content format</StepHeading>
      <StepLead>Pick the format for your first campaign. Each template is made for one format.</StepLead>
      <ChoiceCardGroup
        className="mt-8"
        name="format"
        legend="Content format"
        legendHidden
        columns={2}
        value={values.format ?? null}
        onChange={(format) => onChange({ format: format as OnboardingAnswers["format"] })}
        options={contentFormats.map((format) => ({
          value: format,
          media: <FormatArt format={format} className="mb-3" />,
          label: <span className="text-lg">{contentFormatLabels[format]}</span>,
          description: formatDescriptions[format],
        }))}
      />
      {willClear ? (
        <p className="mt-4 text-sm text-slate-help" role="status">
          Your “{chosenTemplate.name}” template is for {contentFormatLabels[chosenTemplate.format]}, so you’ll choose a new template next.
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 8 · Template
 * ------------------------------------------------------------------------- */

export function TemplateStep({ values, onChange, clearedTemplateName }: StepProps & { clearedTemplateName: string | null }) {
  const format = values.format;
  const templates = format ? templatesForFormat(format) : [];
  const columns = templates.length >= 5 ? 5 : templates.length >= 3 ? 3 : 2;
  return (
    <div className={cn("w-full", columns === 5 ? "max-w-[880px]" : "max-w-[640px]")}>
      <StepHeading>Start from a template</StepHeading>
      {format ? (
        <>
          <h2 className="mt-8 text-[17px] font-semibold text-navy">Templates for {contentFormatLabels[format]}</h2>
          <p className="mt-1 text-sm text-slate-help">Your playbook starts as a draft. You can edit it before anything is published.</p>
          {clearedTemplateName ? (
            <InlineAlert tone="info" className="mt-4">
              “{clearedTemplateName}” doesn’t fit the {contentFormatLabels[format]} format, so choose a template for this format.
            </InlineAlert>
          ) : null}
          <ChoiceCardGroup
            className="mt-5 [&_label]:p-2.5"
            name="templateId"
            legend={`Templates for ${contentFormatLabels[format]}`}
            legendHidden
            columns={columns}
            tone="accent"
            value={values.templateId ?? null}
            onChange={(templateId) => onChange({ templateId })}
            options={templates.map((template) => ({
              value: template.id,
              media: <TemplateArt templateId={template.id} className="mb-2" />,
              label: <span className="text-sm">{template.name}</span>,
              description: <span className="text-[13px] leading-snug">{template.summary}</span>,
            }))}
          />
        </>
      ) : (
        <StepLead>Choose a content format first.</StepLead>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 9 · Billing threshold
 * ------------------------------------------------------------------------- */

export function BillingStep({ values, onChange }: StepProps) {
  return (
    <div className="w-full max-w-[620px]">
      <StepHeading>How often do you want to be charged?</StepHeading>
      <StepLead>We bill in increments as creators earn for you. Pick the amount that suits you.</StepLead>
      <ChoiceCardGroup
        className="mt-8 [&_label]:px-5 [&_label]:py-5"
        name="billingThresholdCents"
        legend="Billing threshold"
        legendHidden
        columns={3}
        value={values.billingThresholdCents !== undefined ? String(values.billingThresholdCents) : null}
        onChange={(cents) => onChange({ billingThresholdCents: Number(cents) })}
        options={billingThresholdOptions().map((option) => ({
          value: String(option.cents),
          label: <span className="text-[26px] font-bold leading-tight">{formatUsd(option.cents)}</span>,
          description: option.description,
        }))}
      />
    </div>
  );
}
