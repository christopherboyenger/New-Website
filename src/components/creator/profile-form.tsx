"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { CatalogOption } from "@/domain/targeting-catalog";
import { updateCreatorProfileAction, type CreatorFormState } from "@/server/creator/actions";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { CreatorAvatar } from "@/components/creators/creator-avatar";

/**
 * Creator profile: the name brands see and the country used for campaign
 * targeting. The avatar is initials only — media storage is not provisioned,
 * so no photo can be uploaded.
 */
export function CreatorProfileForm({ displayName, country, countries }: { displayName: string; country: string | null; countries: CatalogOption[] }) {
  const [state, action, pending] = useActionState<CreatorFormState | null, FormData>(updateCreatorProfileAction, null);
  const [name, setName] = useState(state?.values?.displayName ?? displayName);
  const { notify } = useToast();
  const announced = useRef<CreatorFormState | null>(null);

  useEffect(() => {
    if (state?.ok && announced.current !== state) {
      announced.current = state;
      notify(state.message ?? "Profile saved.", "success");
    }
  }, [state, notify]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div className="flex items-center gap-3">
        <CreatorAvatar name={name.trim() || displayName} size="lg" />
        <p className="text-[13px] text-muted">Your avatar shows your initials. Photo uploads aren&apos;t available yet.</p>
      </div>
      <Field id="displayName" label="Creator name" description="The name brands see next to your posts." error={errors.displayName}>
        <Input
          id="displayName"
          name="displayName"
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-md:h-11"
          {...describedBy("displayName", { description: true, error: errors.displayName })}
        />
      </Field>
      <Field id="country" label="Country you live in" description="Some campaigns are limited to creators in certain countries." error={errors.country}>
        <Select id="country" name="country" required defaultValue={state?.values?.country ?? country ?? ""} className="max-md:h-11" {...describedBy("country", { description: true, error: errors.country })}>
          <option value="" disabled>
            Choose a country
          </option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <Button type="submit" loading={pending} className="max-md:h-11 max-sm:w-full">
          Save profile
        </Button>
      </div>
    </form>
  );
}
