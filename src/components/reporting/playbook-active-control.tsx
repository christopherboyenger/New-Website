"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { changePlaybookActiveAction } from "@/app/home/[org]/(workspace)/campaigns/actions";
import { campaignStatusLabel } from "./format";
import { Switch } from "./switch";
import type { CampaignStatus } from "@/domain/campaign";

/**
 * Distribution switch for a PUBLISHED playbook. Drafts show a "Draft" badge
 * and no switch (a draft is never shown to creators). Without
 * playbook:publish the real state is shown read-only.
 */
export function PlaybookActiveControl({
  slug,
  playbook,
  canPublish,
}: {
  slug: string;
  playbook: { id: string; name: string; status: "draft" | "published"; active: boolean; campaignName: string; campaignStatus: CampaignStatus };
  canPublish: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const statusId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  if (playbook.status === "draft") return <Badge>Draft</Badge>;
  const stateLabel = playbook.active ? "On" : "Off";
  if (!canPublish) return <Badge tone={playbook.active ? "success" : "neutral"}>{stateLabel}</Badge>;

  const target = !playbook.active;

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await changePlaybookActiveAction(slug, { playbookId: playbook.id, active: target });
      if (result.ok) {
        setOpen(false);
        notify(result.message ?? "Playbook updated.", "success");
      } else {
        setError({ message: result.error, conflict: result.code === "conflict" });
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={playbook.active} aria-label={`Active: ${playbook.name}`} aria-describedby={statusId} onClick={() => setOpen(true)} />
      <span id={statusId} className="text-xs text-muted">
        {stateLabel}
      </span>
      <Dialog
        open={open}
        onClose={close}
        size="sm"
        className="whitespace-normal"
        title={target ? `Turn on ${playbook.name}?` : `Turn off ${playbook.name}?`}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            {error?.conflict ? (
              <Button
                onClick={() => {
                  setOpen(false);
                  setError(null);
                  router.refresh();
                }}
              >
                Reload
              </Button>
            ) : (
              <Button onClick={confirm} loading={pending}>
                {target ? "Turn on" : "Turn off"}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          {target ? (
            <p>
              Eligible creators can pick this playbook while <span className="font-medium text-ink">{playbook.campaignName}</span> is active.
              {playbook.campaignStatus !== "active" ? ` The campaign is ${campaignStatusLabel(playbook.campaignStatus).toLowerCase()}, so nobody sees it until the campaign is activated.` : ""}
            </p>
          ) : (
            <p>Creators will no longer be offered this playbook. Its content and published version are kept, and you can turn it back on later.</p>
          )}
          <FormError message={error?.message} />
        </div>
      </Dialog>
    </div>
  );
}
