"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { BusinessInformation } from "@/server/billing/commands";
import { updateBusinessInfoAction } from "@/app/home/[org]/(workspace)/billing/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

type FieldName = "businessName" | "line1" | "line2" | "city" | "region" | "postalCode" | "country" | "taxId";

const fields: Array<{ name: FieldName; label: string; autoComplete?: string; optional?: boolean; description?: string; wide?: boolean }> = [
  { name: "businessName", label: "Business name", autoComplete: "organization", wide: true },
  { name: "line1", label: "Address line 1", autoComplete: "address-line1", optional: true, wide: true },
  { name: "line2", label: "Address line 2", autoComplete: "address-line2", optional: true, wide: true },
  { name: "city", label: "City", autoComplete: "address-level2", optional: true },
  { name: "region", label: "State / region", autoComplete: "address-level1", optional: true },
  { name: "postalCode", label: "Postal code", autoComplete: "postal-code", optional: true },
  { name: "country", label: "Country", autoComplete: "country-name", optional: true },
  { name: "taxId", label: "Tax ID", optional: true, description: "VAT, GST or EIN, as it should appear on receipts.", wide: true },
];

/** Owner-only business details used on receipts. Saved with a revision check so concurrent edits are never overwritten. */
export function BusinessInfoDialog({ slug, info, revision, hasInfo }: { slug: string; info: BusinessInformation; revision: string; hasInfo: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const initial: Record<FieldName, string> = {
    businessName: info.businessName,
    line1: info.address.line1 ?? "",
    line2: info.address.line2 ?? "",
    city: info.address.city ?? "",
    region: info.address.region ?? "",
    postalCode: info.address.postalCode ?? "",
    country: info.address.country ?? "",
    taxId: info.taxId,
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: Record<string, string> = { revision };
    for (const f of fields) input[f.name] = String(data.get(f.name) ?? "");
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateBusinessInfoAction(slug, input);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      notify(result.message ?? "Business information saved.", "success");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setError(null);
          setFieldErrors({});
          setOpen(true);
        }}
      >
        {hasInfo ? "Edit business information" : "Add business information"}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Business information"
        description="Shown on your receipts. Changing it never charges your card."
        size="lg"
      >
        <form id="business-info-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `business-${f.name}`;
              const fieldError = fieldErrors[f.name];
              return (
                <Field key={f.name} id={id} label={f.label} optional={f.optional} description={f.description} error={fieldError} className={f.wide ? "sm:col-span-2" : undefined}>
                  <Input
                    id={id}
                    name={f.name}
                    defaultValue={initial[f.name]}
                    autoComplete={f.autoComplete}
                    required={!f.optional}
                    {...describedBy(id, { description: Boolean(f.description), error: fieldError })}
                  />
                </Field>
              );
            })}
          </div>
          <FormError message={error} />
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
