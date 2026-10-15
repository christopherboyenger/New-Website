"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignStatus } from "@/domain/campaign";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { changeCampaignStatusAction } from "@/app/home/[org]/(workspace)/campaigns/actions";
import { campaignStatusLabel, formatSpend } from "./format";
import { Switch } from "./switch";

/**
 * Active switch for one campaign (owners only). The switch shows the real
 * status; turning it on or off opens a confirmation explaining the documented
 * consequences, and only the confirmed server result changes the row.
 */
export function CampaignStatusControl({
  slug,
  campaign,
}: {
  slug: string;
  campaign: { id: string; name: string; status: CampaignStatus; version: number; dailyBudgetCents: number; pricingMode: "daily" | "manual" };
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const statusId = useId();
  const active = campaign.status === "active";
  const target = active ? "paused" : "active";

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await changeCampaignStatusAction(slug, { campaignId: campaign.id, expectedVersion: campaign.version, status: target });
      if (result.ok) {
        setOpen(false);
        notify(result.message ?? (target === "active" ? "Campaign activated." : "Campaign paused."), "success");
      } else {
        setError({ message: result.error, conflict: result.code === "conflict" });
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={active} aria-label={`Active: ${campaign.name}`} aria-describedby={statusId} onClick={() => setOpen(true)} />
      <span id={statusId} className="text-xs text-muted">
        {campaignStatusLabel(campaign.status)}
      </span>
      <Dialog
        open={open}
        onClose={close}
        size="sm"
        title={active ? `Pause ${campaign.name}?` : `Activate ${campaign.name}?`}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            {error?.conflict ? (
              <Button
                variant="primary"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                  router.refresh();
                }}
              >
                Reload
              </Button>
            ) : (
              <Button variant={active ? "danger" : "primary"} onClick={confirm} loading={pending}>
                {active ? "Pause campaign" : "Activate campaign"}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          {active ? (
            <>
              <p>Pausing stops spending and earning for all of this campaign&apos;s posts — including posts made before the pause.</p>
              <p>Creators can&apos;t earn from it until you activate it again. Your settings and playbooks are kept.</p>
            </>
          ) : (
            <>
              <p>Activating makes this campaign visible to eligible creators. Approved posts earn, and spend accrues against your budget.</p>
              {campaign.pricingMode === "daily" ? (
                <p>
                  Your budget is a {formatSpend(campaign.dailyBudgetCents)} daily <strong className="font-medium text-ink">average</strong>, not a cap: some days
                  can spend more, averaging out over the week.
                </p>
              ) : null}
              <p>Only published, active playbooks are shown to creators.</p>
            </>
          )}
          <p className="text-muted">Current status: {campaignStatusLabel(campaign.status)}.</p>
          <FormError message={error?.message} />
        </div>
      </Dialog>
    </div>
  );
}
