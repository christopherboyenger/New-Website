"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/action-result";
import type { Role } from "@/server/db/schema/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormError, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export type ChangeRoleCommand = (input: { userId: string; role: Role }) => Promise<ActionResult<{ role: Role }>>;
export type RemoveMemberCommand = (input: { userId: string }) => Promise<ActionResult<{ userId: string }>>;

const roleText: Record<Role, { label: string; help: string }> = {
  owner: { label: "Owner", help: "Full control, including campaigns, billing, integrations and managing Members." },
  member: { label: "Member", help: "Can view reporting, edit playbook drafts and use messages, but can't manage campaigns, billing or the team." },
};

/**
 * "Manage" for a teammate the viewer outranks: change role and/or remove.
 * A dialog (not a popover) so it is never clipped by the scrolling table.
 */
export function MemberActions({
  member,
  roleOptions,
  changeRoleAction,
  removeAction,
}: {
  member: { userId: string; name: string; email: string; role: Role };
  roleOptions: Role[];
  changeRoleAction: ChangeRoleCommand;
  removeAction: RemoveMemberCommand;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(member.role);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();
  const selectId = `role-${member.userId}`;

  function close() {
    if (pending) return;
    setOpen(false);
    setRole(member.role);
    setConfirmRemove(false);
    setError(null);
  }

  function run(kind: "role" | "remove") {
    setError(null);
    startTransition(async () => {
      const result = kind === "remove" ? await removeAction({ userId: member.userId }) : await changeRoleAction({ userId: member.userId, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify(result.message ?? "Saved.", "success");
      setOpen(false);
      setConfirmRemove(false);
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Manage ${member.name}`} className="max-md:min-h-11">
        Manage
      </Button>
      <Dialog open={open} onClose={close} size="sm" title={`Manage ${member.name}`} description={member.email}>
        <div className="space-y-5 text-sm">
          <FormError message={error} />
          {roleOptions.length > 1 ? (
            <div className="space-y-3">
              <Field id={selectId} label="Role" description={roleText[role].help}>
                <Select id={selectId} value={role} onChange={(e) => setRole(e.target.value as Role)} {...describedBy(selectId, { description: true })} className="max-md:h-11">
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {roleText[r].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end">
                <Button onClick={() => run("role")} disabled={role === member.role} loading={pending && !confirmRemove}>
                  Change role
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-ink-2">
              Role: <span className="font-medium text-ink">{roleText[member.role].label}</span>. Only the primary owner can make someone an Owner.
            </p>
          )}

          <div className="border-t border-line pt-4">
            <h3 className="font-medium text-ink">Remove from team</h3>
            <p className="mt-1 text-ink-2">
              They lose access to this workspace immediately. Content they created stays. They&apos;ll need a new invitation to return.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              {confirmRemove ? (
                <>
                  <Button variant="secondary" onClick={() => setConfirmRemove(false)} disabled={pending}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={() => run("remove")} loading={pending}>
                    Remove {member.name}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => setConfirmRemove(true)} className="text-danger">
                  Remove from team…
                </Button>
              )}
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
