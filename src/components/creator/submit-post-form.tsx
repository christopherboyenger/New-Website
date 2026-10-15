"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { platformLabels, type Platform } from "@/domain/campaign";
import type { CreatorFormState } from "@/server/creator/actions";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export interface SubmitAccountOption {
  id: string;
  platform: Platform;
  handle: string;
  /** Ad placements the creator can authorize for posts from this platform (empty = none). */
  adPlacements: string[];
}

export type SubmitState = CreatorFormState<{ postId: string; adRightsGranted: boolean }>;

const urlExamples: Record<Platform, string> = {
  tiktok: "https://www.tiktok.com/@handle/video/…",
  youtube: "https://www.youtube.com/shorts/…",
  instagram: "https://www.instagram.com/reel/…",
  snapchat: "https://www.snapchat.com/spotlight/…",
  facebook_reels: "https://www.facebook.com/reel/…",
};

/**
 * Submit a published post for brand review. The account must be one of the
 * creator's own on a campaign platform; paid-ad rights are an explicit,
 * unticked-by-default opt-in with the terms shown next to the checkbox.
 */
export function SubmitPostForm({
  submitAction,
  primaryHashtag,
  accounts,
  adTermsText,
  captionMaxLength,
}: {
  /** submitPostAction bound to this campaign and playbook on the server. */
  submitAction: (prev: SubmitState | null, formData: FormData) => Promise<SubmitState>;
  primaryHashtag: string;
  accounts: SubmitAccountOption[];
  adTermsText: string;
  captionMaxLength: number;
}) {
  const [state, action, pending] = useActionState<SubmitState | null, FormData>(submitAction, null);
  const values = state && !state.ok ? state.values : undefined;
  const [accountId, setAccountId] = useState(values?.socialAccountId ?? (accounts.length === 1 ? accounts[0].id : ""));
  const formRef = useRef<HTMLFormElement>(null);
  const announced = useRef<SubmitState | null>(null);
  const { notify } = useToast();

  useEffect(() => {
    if (state?.ok && announced.current !== state) {
      announced.current = state;
      formRef.current?.reset();
      notify(state.data.adRightsGranted ? "Post submitted for review, with paid-ad rights granted." : "Post submitted for review.", "success");
    }
  }, [state, notify]);

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted">
        Link an account on this campaign&apos;s platforms before submitting.{" "}
        <Link href="/creator/profile#accounts" className="font-medium text-ink underline underline-offset-4">
          Add an account
        </Link>
      </p>
    );
  }

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const selected = accounts.find((a) => a.id === accountId) ?? null;
  const placements = selected?.adPlacements ?? [];

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-5">
      {state && !state.ok ? <FormError message={state.error} /> : null}
      {state?.ok ? (
        <p role="status" className="rounded-[10px] border border-line bg-canvas px-3 py-2 text-sm text-ink">
          Submitted. Track its review on{" "}
          <Link href="/creator/submissions" className="font-medium underline underline-offset-4">
            Submissions
          </Link>
          .
        </p>
      ) : null}

      <Field id="socialAccountId" label="Account you posted from" error={errors.socialAccountId}>
        <Select
          id="socialAccountId"
          name="socialAccountId"
          required
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="max-md:h-11"
          {...describedBy("socialAccountId", { error: errors.socialAccountId })}
        >
          <option value="" disabled>
            Choose an account
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {platformLabels[a.platform]} · @{a.handle}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="url" label="Link to your post" description={selected ? `For example ${urlExamples[selected.platform]}` : "Use the post's https:// link."} error={errors.url}>
        <Input
          id="url"
          name="url"
          type="url"
          inputMode="url"
          required
          maxLength={500}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={values?.url ?? ""}
          className="max-md:h-11"
          {...describedBy("url", { description: true, error: errors.url })}
        />
      </Field>

      <Field id="caption" label="Caption you posted with" description={`Paste it exactly as posted. It must include #${primaryHashtag}.`} error={errors.caption}>
        <Textarea
          id="caption"
          name="caption"
          required
          rows={4}
          maxLength={captionMaxLength}
          defaultValue={values?.caption ?? ""}
          {...describedBy("caption", { description: true, error: errors.caption })}
        />
      </Field>

      <fieldset className="rounded-[10px] border border-line p-4">
        <legend className="px-1 text-sm font-medium text-ink">Paid-ad rights (optional)</legend>
        {placements.length > 0 ? (
          <>
            <label className="flex min-h-11 items-start gap-2.5 text-sm text-ink md:min-h-0">
              <input
                type="checkbox"
                name="grantAdRights"
                defaultChecked={values?.grantAdRights === "on"}
                className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-ink"
                aria-describedby="ad-terms"
                {...(errors.grantAdRights ? { "aria-invalid": true } : {})}
              />
              <span>Grant paid-ad rights for this post</span>
            </label>
            <p id="ad-terms" className="mt-2 text-[13px] leading-relaxed text-ink-2">
              {adTermsText} Ad platforms: {placements.join(", ")}.
            </p>
          </>
        ) : (
          <p className="text-[13px] text-muted">
            {selected ? `Paid-ad rights can't be granted for ${platformLabels[selected.platform]} posts here.` : "Choose an account to see whether paid-ad rights can be granted for it."}
          </p>
        )}
        {errors.grantAdRights ? <p className="mt-2 text-[13px] text-danger">{errors.grantAdRights}</p> : null}
      </fieldset>

      <div>
        <Button type="submit" loading={pending} className="max-md:h-11 max-sm:w-full">
          Submit for review
        </Button>
      </div>
    </form>
  );
}
