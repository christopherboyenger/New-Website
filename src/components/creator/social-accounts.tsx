"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { platformLabels, platforms, type Platform } from "@/domain/campaign";
import type { ActionResult } from "@/server/action-result";
import { addSocialAccountAction, removeSocialAccountAction, type CreatorFormState } from "@/server/creator/actions";
import type { SocialAccountRow } from "@/server/creator/profile";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/feedback";
import { Checkbox, describedBy, Field, FormError, Input, InputAdornment, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

const verificationLabel: Record<SocialAccountRow["verification"], { label: string; tone: "neutral" | "success" | "warning" | "info" }> = {
  unverified: { label: "Unverified", tone: "neutral" },
  pending: { label: "Verification pending", tone: "info" },
  verified: { label: "Verified", tone: "success" },
  failed: { label: "Verification failed", tone: "warning" },
};

/** Linked accounts with removal. Accounts that already have submissions stay linked (the server enforces it). */
export function SocialAccountList({ accounts }: { accounts: SocialAccountRow[] }) {
  if (accounts.length === 0) {
    return <p className="text-sm text-muted">No accounts linked yet. Add the accounts you post from to see campaigns for those platforms.</p>;
  }
  return (
    <ul className="divide-y divide-line rounded-[10px] border border-line">
      {accounts.map((account) => (
        <li key={account.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-ink">
              <span className="text-ink-2">{platformLabels[account.platform]}</span> <span className="font-medium">@{account.handle}</span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={verificationLabel[account.verification].tone}>{verificationLabel[account.verification].label}</Badge>
              {account.dedicated ? <Badge tone="info">Dedicated account</Badge> : null}
              <span className="text-xs text-muted">
                {account.submissions === 1 ? "1 submission" : `${account.submissions.toLocaleString("en-US")} submissions`}
              </span>
            </p>
          </div>
          <RemoveAccountButton account={account} />
        </li>
      ))}
    </ul>
  );
}

function RemoveAccountButton({ account }: { account: SocialAccountRow }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();
  const name = `@${account.handle} on ${platformLabels[account.platform]}`;
  const locked = account.submissions > 0;

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <Button
        size="sm"
        variant="ghost"
        className="max-md:h-11 max-sm:self-start"
        disabled={locked}
        aria-describedby={locked ? `locked-${account.id}` : undefined}
        aria-label={`Remove ${name}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Remove
      </Button>
      {locked ? (
        <p id={`locked-${account.id}`} className="text-xs text-muted sm:max-w-56 sm:text-right">
          Stays linked because brands use it to trace your submitted posts.
        </p>
      ) : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Remove this account?"
        description={`${name} will no longer be linked to your creator profile.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result: ActionResult = await removeSocialAccountAction(account.id);
                  if (result.ok) {
                    setOpen(false);
                    notify(result.message ?? "Account removed.", "success");
                  } else setError(result.error);
                })
              }
            >
              Remove account
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Campaigns that need this platform will stop appearing for you unless you link another account on it.</p>
        {error ? (
          <div className="mt-3">
            <FormError message={error} />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/** Adds an account as "unverified". Ownership verification needs a platform connection that isn't available. */
export function AddSocialAccountForm({ disabledReason }: { disabledReason: string | null }) {
  const [state, action, pending] = useActionState<CreatorFormState<{ id: string }> | null, FormData>(addSocialAccountAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const announced = useRef<CreatorFormState<{ id: string }> | null>(null);
  const { notify } = useToast();

  useEffect(() => {
    if (state?.ok && announced.current !== state) {
      announced.current = state;
      formRef.current?.reset();
      notify(state.message ?? "Account added.", "success");
    }
  }, [state, notify]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const values = state && !state.ok ? state.values : undefined;

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-4" aria-labelledby="add-account-title">
      <h3 id="add-account-title" className="text-sm font-semibold text-ink">
        Add an account
      </h3>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <Field id="platform" label="Platform" error={errors.platform}>
          <Select
            id="platform"
            name="platform"
            required
            defaultValue={(values?.platform as Platform | undefined) ?? ""}
            disabled={!!disabledReason}
            className="max-md:h-11"
            {...describedBy("platform", { error: errors.platform })}
          >
            <option value="" disabled>
              Choose
            </option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {platformLabels[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="handle" label="Handle" error={errors.handle}>
          <InputAdornment prefix="@">
            <Input
              id="handle"
              name="handle"
              required
              maxLength={51}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              defaultValue={values?.handle ?? ""}
              disabled={!!disabledReason}
              className="max-md:h-11"
              {...describedBy("handle", { error: errors.handle })}
            />
          </InputAdornment>
        </Field>
      </div>
      <Checkbox
        name="dedicated"
        label="This is a dedicated account I created for brand content"
        defaultChecked={values?.dedicated === "on"}
        disabled={!!disabledReason}
        className="min-h-11 md:min-h-0"
      />
      <div className="flex flex-col gap-1.5">
        <div>
          <Button type="submit" loading={pending} disabled={!!disabledReason} aria-describedby={disabledReason ? "add-account-disabled" : undefined} className="max-md:h-11 max-sm:w-full">
            Add account
          </Button>
        </div>
        {disabledReason ? (
          <p id="add-account-disabled" className="text-xs text-muted">
            {disabledReason}
          </p>
        ) : null}
      </div>
    </form>
  );
}
