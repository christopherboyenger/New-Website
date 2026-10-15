"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { billingThresholdOptions } from "@/domain/onboarding";
import { formatUsd } from "@/lib/money";
import { updateThresholdAction } from "@/app/home/[org]/(workspace)/billing/actions";
import { Button } from "@/components/ui/button";
import { ChoiceCardGroup } from "@/components/ui/choice-card";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

/** "Charged every $50.00" with an owner-only editor for the monetary charge threshold. */
export function ThresholdEditor({ slug, thresholdCents, version, canManage }: { slug: string; thresholdCents: number; version: number; canManage: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(thresholdCents));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const options = billingThresholdOptions();

  function openEditor() {
    setValue(String(thresholdCents));
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateThresholdAction(slug, { thresholdCents: Number(value), expectedVersion: version });
      if (!result.ok) {
        setError(result.fieldErrors?.thresholdCents ?? result.error);
        return;
      }
      setOpen(false);
      notify(result.message ?? "Billing threshold saved.", "success");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[13px] text-muted">Charged every</p>
        <p className="text-sm font-semibold text-ink tabular-nums">{formatUsd(thresholdCents, { decimals: 2 })}</p>
      </div>
      {canManage ? (
        <Button variant="ghost" size="sm" onClick={openEditor} aria-label="Edit billing threshold" className="min-h-11 md:min-h-8">
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </Button>
      ) : null}
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Billing threshold"
        description="Your card is charged each time your balance reaches this amount. It’s a monetary increment, not a schedule."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} loading={pending} disabled={Number(value) === thresholdCents}>
              Save threshold
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <ChoiceCardGroup
            name="thresholdCents"
            legend="Charge me every"
            legendHidden
            tone="ink"
            columns={3}
            value={value}
            onChange={setValue}
            options={options.map((o) => ({ value: String(o.cents), label: formatUsd(o.cents), description: o.description }))}
          />
          <p className="text-[13px] text-muted">Changing the threshold never charges your card by itself.</p>
          <FormError message={error} />
        </div>
      </Dialog>
    </div>
  );
}
