"use client";

import { useState, useTransition } from "react";
import { Crown } from "lucide-react";
import type { ActionResult } from "@/server/action-result";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export type TransferCommand = (input: { userId: string; password: string }) => Promise<ActionResult<{ userId: string }>>;

/**
 * Primary-owner only. The target must already be an Owner; the password is
 * re-entered every time (step-up authentication).
 */
export function TransferOwnership({ candidates, transferAction }: { candidates: Array<{ userId: string; name: string; email: string }>; transferAction: TransferCommand }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(candidates[0]?.userId ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  function close() {
    if (pending) return;
    setOpen(false);
    setPassword("");
    setError(null);
    setFieldErrors({});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await transferAction({ userId, password });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      notify(result.message ?? "Ownership transferred.", "success");
      setOpen(false);
      setPassword("");
    });
  }

  const target = candidates.find((c) => c.userId === userId);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-2">
          {candidates.length
            ? "Hand primary ownership to another Owner. You'll stay an Owner, but they'll control ownership from then on."
            : "To transfer primary ownership, first make another teammate an Owner."}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={candidates.length === 0} className="max-md:min-h-11">
          <Crown className="size-3.5" aria-hidden="true" />
          Transfer ownership
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={close}
        size="sm"
        title="Transfer primary ownership"
        description="Only Owners can receive primary ownership. Confirm with your password."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="transfer-ownership-form" variant="danger" loading={pending} disabled={!userId || !password}>
              Transfer
            </Button>
          </>
        }
      >
        <form id="transfer-ownership-form" onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <Field id="transfer-target" label="New primary owner" error={fieldErrors.userId}>
            <Select id="transfer-target" value={userId} onChange={(e) => setUserId(e.target.value)} {...describedBy("transfer-target", { error: fieldErrors.userId })}>
              {candidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.name} ({c.email})
                </option>
              ))}
            </Select>
          </Field>
          <Field id="transfer-password" label="Your password" error={fieldErrors.password}>
            <Input
              id="transfer-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              {...describedBy("transfer-password", { error: fieldErrors.password })}
            />
          </Field>
          {target ? <p className="text-[13px] text-muted">{target.name} becomes the primary owner. Only they can transfer it again.</p> : null}
        </form>
      </Dialog>
    </>
  );
}
