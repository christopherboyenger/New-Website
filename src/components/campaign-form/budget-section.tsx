"use client";

import { Badge, PlanBadge } from "@/components/ui/feedback";
import { ChoiceCardGroup } from "@/components/ui/choice-card";
import { Input } from "@/components/ui/form";
import type { PricingMode } from "@/domain/campaign";
import { formatUsd } from "@/lib/money";
import {
  BUDGET_SLIDER_MAX_DOLLARS,
  BUDGET_SLIDER_MIN_DOLLARS,
  BUDGET_SLIDER_STEP_DOLLARS,
  parseDollarsToCents,
  weeklyAverageCents,
} from "./model";
import { PlanGateNote } from "./plan-gate";
import { SectionFrame, SubHeading, type SectionProps } from "./section-frame";

export function BudgetSection({
  active,
  state,
  update,
  errors,
  entitlements,
  gate,
}: SectionProps) {
  const dailyCents = parseDollarsToCents(state.dailyBudget);
  const validDaily =
    dailyCents !== null && !Number.isNaN(dailyCents) ? dailyCents : null;
  const weekly =
    validDaily !== null ? formatUsd(weeklyAverageCents(validDaily)) : null;
  const sliderValue = Math.min(
    Math.max(
      validDaily !== null
        ? Math.round(validDaily / 100)
        : BUDGET_SLIDER_MIN_DOLLARS,
      BUDGET_SLIDER_MIN_DOLLARS,
    ),
    BUDGET_SLIDER_MAX_DOLLARS,
  );
  const budgetError = errors.dailyBudgetCents;
  const capError = errors.cpmCapCents;
  const capLocked = !entitlements.cpm_cap;

  return (
    <SectionFrame
      id="budget"
      active={active}
      title="Budget & Rates"
      description={
        <>
          Your budget applies once you activate this campaign. Spend may run
          higher at first to attract creators
          {weekly ? <>, averaging out to {weekly}/week.</> : "."}
        </>
      }
    >
      <div id="pricing-mode" className="flex flex-col gap-2">
        <ChoiceCardGroup
          name="pricingMode"
          legend="Pricing mode"
          columns={2}
          tone="ink"
          value={state.pricingMode}
          onChange={(value) => update({ pricingMode: value as PricingMode })}
          options={[
            {
              value: "daily",
              label: "Daily",
              description: "Hit a daily average budget target",
            },
            {
              value: "manual",
              label: "Manual",
              disabled: true,
              badge: (
                <>
                  {entitlements.manual_pricing ? null : (
                    <PlanBadge planName={gate.planName} />
                  )}
                  <Badge>Not available yet</Badge>
                </>
              ),
              description: (
                <>
                  Fully customize your budget
                  <span className="mt-1 block text-[13px] text-muted">
                    Manual rate cards aren&apos;t available yet, so new
                    campaigns use Daily pricing.
                  </span>
                </>
              ),
            },
          ]}
        />
        {errors.pricingMode ? (
          <p className="text-[13px] text-danger">{errors.pricingMode}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <SubHeading id="budget-heading">Budget</SubHeading>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted" aria-hidden="true">
            $
          </span>
          <div className="w-36 shrink-0">
            <Input
              id="budget-amount"
              type="number"
              inputMode="decimal"
              min={BUDGET_SLIDER_MIN_DOLLARS}
              step="any"
              value={state.dailyBudget}
              onChange={(e) => update({ dailyBudget: e.target.value })}
              aria-label="Daily average budget in US dollars"
              aria-describedby={[
                "budget-help",
                budgetError ? "budget-amount-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-invalid={budgetError ? true : undefined}
              className="max-md:h-11"
            />
          </div>
          <span className="text-sm text-muted">daily average</span>
        </div>
        <input
          type="range"
          min={BUDGET_SLIDER_MIN_DOLLARS}
          max={BUDGET_SLIDER_MAX_DOLLARS}
          step={BUDGET_SLIDER_STEP_DOLLARS}
          value={sliderValue}
          onChange={(e) => update({ dailyBudget: e.target.value })}
          aria-label="Daily average budget"
          aria-valuetext={`${formatUsd(sliderValue * 100)} per day`}
          className="h-6 w-full cursor-pointer accent-ink max-md:h-11"
        />
        <div
          className="flex justify-between text-xs text-subtle"
          aria-hidden="true"
        >
          <span>{formatUsd(BUDGET_SLIDER_MIN_DOLLARS * 100)}</span>
          <span>{formatUsd(BUDGET_SLIDER_MAX_DOLLARS * 100)}+</span>
        </div>
        {budgetError ? (
          <p id="budget-amount-error" className="text-[13px] text-danger">
            {budgetError}
          </p>
        ) : null}
        <p id="budget-help" className="text-[13px] text-muted">
          Daily spend is an average, not a cap. Individual days may run above or
          below your daily average
          {weekly ? <> but will be averaged to {weekly}/week</> : null}. The
          minimum is {formatUsd(BUDGET_SLIDER_MIN_DOLLARS * 100)}/day; type a
          larger amount than the slider allows if you need to.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <SubHeading>Rates &amp; Bonuses</SubHeading>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="cpm-cap"
            className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink"
          >
            CPM Cap
            {capLocked ? <PlanBadge planName={gate.planName} /> : null}
          </label>
          <p id="cpm-cap-description" className="text-[13px] text-muted">
            How much you&apos;ll pay per 1K views. Leave empty for no cap.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted" aria-hidden="true">
              $
            </span>
            <div className="w-36 shrink-0">
              <Input
                id="cpm-cap"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={state.cpmCap}
                onChange={(e) => update({ cpmCap: e.target.value })}
                disabled={capLocked}
                placeholder="No cap"
                aria-describedby={[
                  "cpm-cap-description",
                  capError ? "cpm-cap-error" : null,
                  capLocked ? "cpm-cap-gate" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-invalid={capError ? true : undefined}
                className="max-md:h-11"
              />
            </div>
            <span className="text-sm text-muted">/ 1K views</span>
          </div>
          {capError ? (
            <p id="cpm-cap-error" className="text-[13px] text-danger">
              {capError}
            </p>
          ) : null}
          {capLocked ? (
            <div id="cpm-cap-gate">
              <PlanGateNote gate={gate}>
                A CPM cap requires the {gate.planName} plan.
              </PlanGateNote>
            </div>
          ) : null}
        </div>
      </div>
    </SectionFrame>
  );
}
