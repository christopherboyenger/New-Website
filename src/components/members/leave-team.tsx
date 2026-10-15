"use client";

import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";
import type { ActionResult } from "@/server/action-result";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";

/** Leaves the workspace; on success the action redirects to /home. */
export type LeaveCommand = () => Promise<ActionResult<never> | void>;

/**
 * "Leave Team" (Danger zone). The primary owner sees the button disabled with
 * the prerequisite (transfer ownership first); everyone else confirms.
 */
export function LeaveTeam({ workspaceName, isPrimaryOwner, leaveAction }: { workspaceName: string; isPrimaryOwner: boolean; leaveAction: LeaveCommand }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function leave() {
    setError(null);
    startTransition(async () => {
      const result = await leaveAction();
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        Click the button below to leave the team. Remember, you will no longer have access to it and will need to be re-invited to join.
      </p>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)} disabled={isPrimaryOwner} aria-describedby={isPrimaryOwner ? "leave-team-reason" : undefined} className="max-md:min-h-11">
        <LogOut className="size-3.5" aria-hidden="true" />
        Leave Team
      </Button>
      {isPrimaryOwner ? (
        <p id="leave-team-reason" className="text-[13px] text-muted">
          You&apos;re the primary owner. Transfer primary ownership to another Owner on the Members page before leaving.
        </p>
      ) : null}
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) {
            setOpen(false);
            setError(null);
          }
        }}
        size="sm"
        title={`Leave ${workspaceName}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={leave} loading={pending}>
              Leave Team
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          <p>You&apos;ll lose access to this workspace right away. An Owner will need to invite you again for you to return.</p>
          <FormError message={error} />
        </div>
      </Dialog>
    </div>
  );
}
