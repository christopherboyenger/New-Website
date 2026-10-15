"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/feedback";
import { Checkbox, FormError } from "@/components/ui/form";
import { campaignStatusLabels, type CampaignStatus } from "@/domain/campaign";
import type { PublishIssue } from "@/domain/playbook-validation";
import type { PaymentGate } from "@/server/playbooks";

/**
 * Explicit publish confirmation. Shows what blocks publishing (content,
 * payment readiness), states that publishing neither activates the campaign
 * nor charges, and asks separately whether creators may see the playbook.
 */
export function PublishDialog({
  open,
  onClose,
  issues,
  payment,
  campaign,
  dirty,
  publishedRevision,
  currentlyActive,
  busy,
  serverError,
  onPublish,
}: {
  open: boolean;
  onClose: () => void;
  issues: PublishIssue[];
  payment: PaymentGate;
  campaign: { name: string; status: CampaignStatus };
  dirty: boolean;
  publishedRevision: number | null;
  currentlyActive: boolean;
  busy: boolean;
  serverError: { message: string; details: string[] } | null;
  onPublish: (makeActive: boolean) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={publishedRevision ? "Publish changes" : "Publish playbook"} size="md">
      {open ? (
        <PublishForm
          issues={issues}
          payment={payment}
          campaign={campaign}
          dirty={dirty}
          publishedRevision={publishedRevision}
          currentlyActive={currentlyActive}
          busy={busy}
          serverError={serverError}
          onCancel={onClose}
          onPublish={onPublish}
        />
      ) : null}
    </Dialog>
  );
}

function PublishForm({
  issues,
  payment,
  campaign,
  dirty,
  publishedRevision,
  currentlyActive,
  busy,
  serverError,
  onCancel,
  onPublish,
}: Omit<Parameters<typeof PublishDialog>[0], "open" | "onClose"> & {
  onCancel: () => void;
}) {
  const [makeActive, setMakeActive] = useState(currentlyActive);
  const blocked = issues.length > 0 || !payment.ready;
  const nextRevision = (publishedRevision ?? 0) + 1;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">
        Publishing saves a frozen copy of this playbook as revision {nextRevision}. Later edits stay in your draft until you publish again; posts already made
        keep the revision they were made from.
      </p>

      {issues.length > 0 ? (
        <InlineAlert tone="warning" title="Finish these before publishing">
          <ul className="mt-1 list-disc pl-4">
            {issues.map((issue, i) => (
              <li key={`${issue.key}-${i}`}>{issue.message}</li>
            ))}
          </ul>
        </InlineAlert>
      ) : null}

      {!payment.ready ? (
        <InlineAlert
          tone="warning"
          title="A payment method is required"
          action={
            payment.billingHref && payment.providerConfigured ? (
              <Link href={payment.billingHref} className="text-sm font-medium text-ink underline underline-offset-2">
                Open Billing
              </Link>
            ) : null
          }
        >
          {payment.message}
        </InlineAlert>
      ) : null}

      <div className="rounded-[10px] border border-line bg-canvas px-3.5 py-3 text-sm text-ink-2">
        <p>
          Campaign <span className="font-medium text-ink">{campaign.name}</span> is{" "}
          <span className="font-medium text-ink">{campaignStatusLabels[campaign.status]}</span>. Publishing doesn&apos;t change the campaign and doesn&apos;t
          charge anything.
          {campaign.status !== "active" ? " Creators only see playbooks while their campaign is active." : null}
        </p>
      </div>

      <Checkbox
        label="Make available to creators while the campaign is active"
        checked={makeActive}
        onChange={(e) => setMakeActive(e.target.checked)}
        disabled={blocked}
        className="items-start [&>input]:mt-0.5"
      />

      {dirty && !blocked ? <p className="text-[13px] text-muted">Your unsaved changes will be saved first.</p> : null}

      {serverError ? (
        <div className="flex flex-col gap-1">
          <FormError message={serverError.message} />
          {serverError.details.length > 0 ? (
            <ul className="list-disc pl-5 text-[13px] text-danger">
              {serverError.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="secondary" onClick={onCancel} className="max-md:min-h-11">
          Cancel
        </Button>
        <Button onClick={() => onPublish(makeActive)} disabled={blocked} loading={busy} className="max-md:min-h-11">
          {dirty ? "Save and publish" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
