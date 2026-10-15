"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import type { ActionResult } from "@/server/action-result";
import type { InviteResult } from "@/server/invitations";
import type { Role } from "@/server/db/schema/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormError, Input, Select } from "@/components/ui/form";
import { DeliveryResult } from "./delivery-result";

export type InviteCommand = (input: { emails: string[]; role: Role }) => Promise<ActionResult<{ results: InviteResult[] }>>;

const roleText: Record<Role, { label: string; help: string }> = {
  member: { label: "Member", help: "Can view reporting, edit playbook drafts and use messages." },
  owner: { label: "Owner", help: "Full control, including campaigns, billing and team management." },
};

interface Row {
  key: number;
  email: string;
}

/**
 * "Invite Members to your Team" (L32): email rows with Add another one /
 * Remove invite, plus a role picker limited to the roles the inviter may
 * grant (the captured dialog showed none; see PEOPLE decisions). After
 * sending, the dialog lists each invite's real delivery outcome.
 */
export function InviteDialog({ roles, maxInvites, inviteAction }: { roles: Role[]; maxInvites: number; inviteAction: InviteCommand }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ key: 0, email: "" }]);
  const [role, setRole] = useState<Role>(roles.includes("member") ? "member" : roles[0]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [pending, startTransition] = useTransition();
  const nextKey = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  function reset() {
    setRows([{ key: 0, email: "" }]);
    setRole(roles.includes("member") ? "member" : roles[0]);
    setError(null);
    setFieldErrors({});
    setResults(null);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  function addRow() {
    const key = nextKey.current++;
    setRows((prev) => [...prev, { key, email: "" }]);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLInputElement>(`#invite-email-${key}`)?.focus());
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setFieldErrors({});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await inviteAction({ emails: rows.map((r) => r.email), role });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setResults(result.data.results);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="max-md:min-h-11">
        <UserPlus className="size-3.5" aria-hidden="true" />
        Invite Members
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Invite Members to your Team"
        description={results ? undefined : "Invite members to your team by entering their email and role."}
        footer={
          results ? (
            <>
              <Button variant="secondary" onClick={reset}>
                Invite more
              </Button>
              <Button onClick={close}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={close} disabled={pending}>
                Close
              </Button>
              <Button type="submit" form="invite-members-form" loading={pending}>
                Send Invites
              </Button>
            </>
          )
        }
      >
        {results ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-2" role="status">
              Here&apos;s what happened with each invitation:
            </p>
            <ul className="space-y-2">
              {results.map((r) => (
                <DeliveryResult key={r.email} result={r} />
              ))}
            </ul>
          </div>
        ) : (
          <form id="invite-members-form" onSubmit={submit} noValidate className="space-y-4">
            <FormError message={error} />
            <div ref={listRef} className="space-y-2">
              {rows.map((row, index) => {
                const id = `invite-email-${row.key}`;
                const fieldError = fieldErrors[`emails.${index}`];
                return (
                  <div key={row.key} className="flex items-start gap-2">
                    <Field id={id} label={index === 0 ? "Email" : <span className="sr-only">Email {index + 1}</span>} error={fieldError} className="min-w-0 flex-1">
                      <Input
                        id={id}
                        type="email"
                        autoComplete="off"
                        placeholder="name@company.com"
                        value={row.email}
                        maxLength={254}
                        onChange={(e) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, email: e.target.value } : r)))}
                        {...describedBy(id, { error: fieldError })}
                        className="max-md:h-11"
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                      aria-label={`Remove invite ${index + 1}`}
                      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-ink disabled:opacity-40 max-md:size-11 ${index === 0 ? "mt-[26px]" : ""}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" onClick={addRow} disabled={rows.length >= maxInvites} className="max-md:min-h-11">
              <Plus className="size-3.5" aria-hidden="true" />
              Add another one
            </Button>
            {rows.length >= maxInvites ? <p className="text-[13px] text-muted">You can invite up to {maxInvites} people at a time.</p> : null}

            {roles.length > 1 ? (
              <Field id="invite-role" label="Role" description={roleText[role].help} error={fieldErrors.role}>
                <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)} {...describedBy("invite-role", { description: true, error: fieldErrors.role })}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {roleText[r].label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-[13px] text-muted">
                They&apos;ll join as <span className="font-medium text-ink-2">{roleText[role].label}</span>. {roleText[role].help} Only the primary owner can invite Owners.
              </p>
            )}
          </form>
        )}
      </Dialog>
    </>
  );
}
