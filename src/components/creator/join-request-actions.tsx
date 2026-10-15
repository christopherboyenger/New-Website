"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import type { ActionResult } from "@/server/action-result";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

type Decide = (input: { campaignId: string; creatorId: string }) => Promise<ActionResult>;

/**
 * Approve / Decline for one pending join request. Approve is a single
 * explicit click; Decline asks for confirmation because the creator cannot
 * ask again. Feedback only follows a confirmed server result.
 */
export function JoinRequestActions({
  campaignId,
  creatorId,
  creatorName,
  campaignName,
  removed,
  approveAction,
  rejectAction,
}: {
  campaignId: string;
  creatorId: string;
  creatorName: string;
  campaignName: string;
  removed: boolean;
  approveAction: Decide;
  rejectAction: Decide;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useToast();

  const run = (action: Decide, done: string) =>
    startTransition(async () => {
      setError(null);
      const result = await action({ campaignId, creatorId });
      if (result.ok) {
        setConfirming(false);
        notify(result.message ?? done, "success");
      } else setError(result.error);
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <Button
          size="sm"
          className="max-md:h-11"
          onClick={() => run(approveAction, "Creator approved.")}
          disabled={pending || removed}
          aria-describedby={removed ? `removed-${campaignId}-${creatorId}` : undefined}
          aria-label={`Approve ${creatorName} for ${campaignName}`}
        >
          <Check className="size-3.5" aria-hidden="true" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="max-md:h-11"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          disabled={pending}
          aria-label={`Decline ${creatorName} for ${campaignName}`}
        >
          <X className="size-3.5" aria-hidden="true" />
          Decline
        </Button>
      </div>
      {removed ? (
        <p id={`removed-${campaignId}-${creatorId}`} className="max-w-56 whitespace-normal text-right text-xs text-muted">
          You removed this creator. Restore them on the Creators page to approve.
        </p>
      ) : null}
      {error && !confirming ? <p className="max-w-64 whitespace-normal text-right text-xs text-danger" role="alert">{error}</p> : null}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Decline this request?"
        description={`${creatorName} won't be able to join ${campaignName} or ask again.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => run(rejectAction, "Request declined.")} loading={pending}>
              Decline request
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Their other campaigns with you are not affected.</p>
        {error ? <div className="mt-3"><FormError message={error} /></div> : null}
      </Dialog>
    </div>
  );
}
