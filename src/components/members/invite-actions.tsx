"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/action-result";
import type { InviteResult } from "@/server/invitations";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { DeliveryResult } from "./delivery-result";

export type RenewInviteCommand = (input: { id: string }) => Promise<ActionResult<InviteResult>>;
export type RevokeInviteCommand = (input: { id: string }) => Promise<ActionResult<{ id: string }>>;

/**
 * Pending-invite row actions: Renew (new link, new 7-day expiry, re-sent; also
 * for expired or revoked invitations) and Revoke (the link stops working).
 * Both are confirmed; Renew then shows the real delivery outcome.
 */
export function InviteActions({
  invite,
  renewAction,
  revokeAction,
}: {
  invite: { id: string; email: string; status: "pending" | "expired" | "revoked" };
  renewAction: RenewInviteCommand;
  revokeAction: RevokeInviteCommand;
}) {
  const [mode, setMode] = useState<"renew" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renewed, setRenewed] = useState<InviteResult | null>(null);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  function close() {
    if (pending) return;
    setMode(null);
    setError(null);
    setRenewed(null);
  }

  function run() {
    setError(null);
    startTransition(async () => {
      if (mode === "revoke") {
        const result = await revokeAction({ id: invite.id });
        if (!result.ok) return setError(result.error);
        notify(result.message ?? "Invitation revoked.", "success");
        setMode(null);
        return;
      }
      const result = await renewAction({ id: invite.id });
      if (!result.ok) return setError(result.error);
      setRenewed(result.data);
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => setMode("renew")} aria-label={`Renew invitation to ${invite.email}`} className="max-md:min-h-11">
        Renew
      </Button>
      {invite.status === "pending" ? (
        <Button variant="ghost" size="sm" onClick={() => setMode("revoke")} aria-label={`Revoke invitation to ${invite.email}`} className="text-danger hover:text-danger max-md:min-h-11">
          Revoke
        </Button>
      ) : null}
      <Dialog
        open={mode !== null}
        onClose={close}
        size="sm"
        title={mode === "revoke" ? "Revoke this invitation?" : renewed ? "Invitation renewed" : "Renew this invitation?"}
        footer={
          renewed ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button variant={mode === "revoke" ? "danger" : "primary"} onClick={run} loading={pending}>
                {mode === "revoke" ? "Revoke" : "Renew and send"}
              </Button>
            </>
          )
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          {renewed ? (
            <ul>
              <DeliveryResult result={renewed} />
            </ul>
          ) : mode === "revoke" ? (
            <p>The link sent to {invite.email} stops working immediately. You can renew the invitation later.</p>
          ) : (
            <p>{invite.email} gets a new link that is valid for 7 days. Any earlier link for this invitation stops working.</p>
          )}
          <FormError message={error} />
        </div>
      </Dialog>
    </div>
  );
}
