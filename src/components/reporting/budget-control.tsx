"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MIN_DAILY_BUDGET_CENTS } from "@/domain/campaign";
import { dollarsToCents, formatUsd } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormError, Input, InputAdornment } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { changeCampaignBudgetAction } from "@/app/home/[org]/(workspace)/campaigns/actions";
import { formatSpend } from "./format";

const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;

/** Parses "1,250.50" / "$500" into integer cents, or returns a field error. */
function parseAmount(raw: string): { cents: number } | { error: string } {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return { error: "Enter a daily budget in dollars." };
  if (!AMOUNT_RE.test(cleaned)) return { error: "Enter an amount like 500 or 500.50." };
  const cents = dollarsToCents(Number(cleaned));
  if (cents < MIN_DAILY_BUDGET_CENTS) return { error: `The minimum daily budget is ${formatUsd(MIN_DAILY_BUDGET_CENTS)}.` };
  return { cents };
}

/**
 * Budget cell: "$500.00 Daily". Owners get an "Edit budget" dialog for the
 * daily AVERAGE (DEC-015: not a cap; spend averages to the target over a week).
 * Saving never activates the campaign.
 */
export function BudgetControl({
  slug,
  campaign,
  canEdit,
}: {
  slug: string;
  campaign: { id: string; name: string; version: number; dailyBudgetCents: number; pricingMode: "daily" | "manual" };
  canEdit: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => (campaign.dailyBudgetCents / 100).toFixed(2));
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const label = (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="tabular-nums text-ink">{formatSpend(campaign.dailyBudgetCents)}</span>
      <span className="text-xs text-muted">{campaign.pricingMode === "daily" ? "Daily" : "Manual"}</span>
    </span>
  );

  if (!canEdit || campaign.pricingMode !== "daily") return label;

  const parsed = parseAmount(value);
  const weeklyCents = "cents" in parsed ? parsed.cents * 7 : null;

  function openDialog() {
    setValue((campaign.dailyBudgetCents / 100).toFixed(2));
    setFieldError(undefined);
    setFormError(null);
    setOpen(true);
  }

  function close() {
    if (!pending) setOpen(false);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const result = parseAmount(value);
    if ("error" in result) {
      setFieldError(result.error);
      return;
    }
    setFieldError(undefined);
    setFormError(null);
    startTransition(async () => {
      const response = await changeCampaignBudgetAction(slug, { campaignId: campaign.id, expectedVersion: campaign.version, dailyBudgetCents: result.cents });
      if (response.ok) {
        setOpen(false);
        notify(response.message ?? "Budget saved.", "success");
      } else {
        setFieldError(response.fieldErrors?.dailyBudgetCents);
        setFormError({ message: response.error, conflict: response.code === "conflict" });
      }
    });
  }

  const formId = `${fieldId}-form`;
  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={`Edit budget for ${campaign.name}: ${formatSpend(campaign.dailyBudgetCents)} daily average`}
        className="-mx-1.5 inline-flex min-h-11 items-center rounded-[8px] px-1.5 hover:bg-hover md:min-h-7"
      >
        {label}
      </button>
      <Dialog
        open={open}
        onClose={close}
        size="sm"
        className="whitespace-normal"
        title="Edit budget"
        description={campaign.name}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            {formError?.conflict ? (
              <Button
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
              >
                Reload
              </Button>
            ) : (
              <Button type="submit" form={formId} loading={pending}>
                Save budget
              </Button>
            )}
          </>
        }
      >
        <form id={formId} onSubmit={save} noValidate className="space-y-4">
          <Field
            id={fieldId}
            label="Daily average budget"
            description={`An average target, not a daily cap. Some days can spend more or less; it averages out over the week. Minimum ${formatUsd(MIN_DAILY_BUDGET_CENTS)}.`}
            error={fieldError}
          >
            <InputAdornment prefix="$" suffix="USD / day">
              <Input
                id={fieldId}
                name="dailyBudget"
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                {...describedBy(fieldId, { description: true, error: fieldError })}
              />
            </InputAdornment>
          </Field>
          <p className="text-sm text-ink-2" aria-live="polite">
            {weeklyCents !== null ? (
              <>
                About <span className="font-medium text-ink">{formatSpend(weeklyCents)}</span> per week at this average.
              </>
            ) : (
              "Enter an amount to see the weekly figure."
            )}
          </p>
          <p className="text-[13px] text-muted">Saving changes the budget only. It doesn&apos;t activate or pause the campaign.</p>
          <FormError message={formError?.message} />
        </form>
      </Dialog>
    </>
  );
}
