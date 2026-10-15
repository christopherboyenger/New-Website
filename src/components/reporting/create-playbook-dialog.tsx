"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { campaignStatusLabels, type CampaignStatus } from "@/domain/campaign";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { createPlaybookAction } from "@/app/home/[org]/(workspace)/campaigns/actions";

/**
 * "Create Playbook" (L23): first asks which campaign the playbook belongs to.
 * Continue creates a DRAFT attached to that campaign (never published or
 * activated) and opens the editor. Without campaigns it explains why and,
 * for owners, links to New Campaign.
 */
export function CreatePlaybookDialog({
  slug,
  campaigns,
  initialCampaignId,
  newCampaignHref,
}: {
  slug: string;
  campaigns: Array<{ id: string; name: string; status: CampaignStatus }>;
  /** Preselected when the page is filtered to one campaign. */
  initialCampaignId: string | null;
  /** Null when the viewer can't create campaigns. */
  newCampaignHref: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setChoice(initialCampaignId && campaigns.some((c) => c.id === initialCampaignId) ? initialCampaignId : null);
    setError(null);
    setOpen(true);
  }

  function close() {
    if (!pending) setOpen(false);
  }

  function submit() {
    if (!choice) return;
    setError(null);
    startTransition(async () => {
      const result = await createPlaybookAction(slug, { campaignId: choice });
      if (result.ok) router.push(result.data.editHref);
      else setError(result.error);
    });
  }

  return (
    <>
      <Button size="sm" onClick={openDialog} className="max-md:min-h-11">
        <Plus className="size-3.5" aria-hidden="true" />
        Create Playbook
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Create Playbook"
        description="Choose which campaign this playbook will belong to."
        footer={
          campaigns.length ? (
            <>
              <Button variant="secondary" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!choice} loading={pending}>
                Continue
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          )
        }
      >
        {campaigns.length ? (
          <div className="space-y-3">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">
                Which campaign is this playbook for?
              </legend>
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {campaigns.map((c) => (
                  <label
                    key={c.id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2 text-sm transition-colors",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                      choice === c.id ? "border-ink bg-canvas" : "border-line hover:border-line-strong",
                    )}
                  >
                    <input type="radio" name="campaign" value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="size-4 accent-ink" />
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {c.name} <span className="text-muted">({campaignStatusLabels[c.status]})</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-[13px] text-muted">The playbook starts as a draft. Creators only see it after you publish it and turn it on.</p>
            <FormError message={error} />
          </div>
        ) : (
          <div className="space-y-3 text-sm text-ink-2">
            <p>Every playbook belongs to a campaign, and this workspace doesn&apos;t have one yet.</p>
            {newCampaignHref ? (
              <ButtonLink href={newCampaignHref} size="sm" className="max-md:min-h-11">
                <Plus className="size-3.5" aria-hidden="true" />
                New Campaign
              </ButtonLink>
            ) : (
              <p className="text-muted">Ask a workspace owner to create a campaign first.</p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
