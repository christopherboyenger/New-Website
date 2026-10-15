import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { contentFormatLabels } from "@/domain/playbook-content";
import { ineligibilityMessages, loadCreatorCampaign } from "@/server/campaign-admission";
import { joinCampaignAction } from "@/server/creator/actions";
import { loadCreatorContext, requireCreatorPage } from "@/server/creator/context";
import { EmptyState, InlineAlert } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/layout";
import { CampaignCard } from "@/components/creator/campaign-card";
import { JoinButton } from "@/components/creator/join-button";

type Params = Promise<{ campaignId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { campaignId } = await params;
  const ctx = await loadCreatorContext();
  const campaign = ctx ? await loadCreatorCampaign(ctx, campaignId) : null;
  return { title: campaign ? campaign.name : "Campaign" };
}

/**
 * One campaign for the creator: requirements and admission state; once
 * admitted and while the campaign is active, its published playbooks.
 * Campaigns the creator can neither see nor has joined are not found.
 */
export default async function CreatorCampaignPage({ params }: { params: Params }) {
  const { campaignId } = await params;
  const ctx = await requireCreatorPage(`/creator/campaigns/${encodeURIComponent(campaignId)}`);
  const campaign = await loadCreatorCampaign(ctx, campaignId);
  if (!campaign) notFound();

  const canJoin = campaign.admission === null && campaign.status === "active" && campaign.eligibility.eligible && !campaign.full;

  return (
    <>
      <Link href="/creator/campaigns" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink md:min-h-0">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Campaigns
      </Link>
      <h1 className="sr-only">{campaign.name}</h1>
      <CampaignCard
        campaign={campaign}
        action={
          canJoin ? (
            <JoinButton campaignId={campaign.id} campaignName={campaign.name} requiresApproval={campaign.approvals.requireCreatorApproval} joinAction={joinCampaignAction} openAfterJoin />
          ) : undefined
        }
      />

      <div className="mt-6">
        <AdmissionState campaign={campaign} />
      </div>
    </>
  );
}

function AdmissionState({ campaign }: { campaign: NonNullable<Awaited<ReturnType<typeof loadCreatorCampaign>>> }) {
  if (campaign.admission === null) {
    if (campaign.full) return <InlineAlert tone="warning" title="This campaign is full">It has reached the number of creators the brand set.</InlineAlert>;
    if (!campaign.eligibility.eligible) return <InlineAlert tone="info" title="You can't join this campaign yet">{ineligibilityMessages[campaign.eligibility.reasons[0]]}</InlineAlert>;
    return (
      <InlineAlert tone="info" title={campaign.approvals.requireCreatorApproval ? "The brand approves each creator" : "Join to see the playbook"}>
        {campaign.approvals.requireCreatorApproval
          ? "Ask to join and the brand will review your profile. You'll see the playbook here once they approve."
          : "Once you join, the brand's published playbook opens here with your own version of the script."}
      </InlineAlert>
    );
  }
  if (campaign.admission === "requested") {
    return <InlineAlert tone="info" title="Waiting for the brand">Your request to join is with the brand. The playbook opens here once they approve it.</InlineAlert>;
  }
  if (campaign.admission === "rejected" || campaign.admission === "removed") {
    return <InlineAlert tone="warning" title="You're not part of this campaign">The brand didn&apos;t approve your request to join.</InlineAlert>;
  }
  if (campaign.status !== "active") {
    return (
      <InlineAlert tone="warning" title="This campaign is paused">
        The brand has paused it, so playbooks and submissions are closed until they resume it. Posts don&apos;t earn while a campaign is paused.
      </InlineAlert>
    );
  }
  return (
    <Card>
      <CardHeader title="Playbooks" description="Follow a playbook, post on your own account, then submit the link for review." />
      <CardBody className="pt-3">
        {campaign.playbooks.length === 0 ? (
          <EmptyState title="No playbooks right now" description="The brand has no playbook live for this campaign at the moment." />
        ) : (
          <ul className="divide-y divide-line">
            {campaign.playbooks.map((p) => (
              <li key={p.id}>
                <Link href={`/creator/campaigns/${campaign.id}/playbooks/${p.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3 text-sm hover:bg-hover/60">
                  <span className="flex min-w-0 items-center gap-3">
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{p.name}</span>
                      <span className="text-xs text-muted">{contentFormatLabels[p.format]}</span>
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-ink">
                    Open <ArrowRight className="size-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
