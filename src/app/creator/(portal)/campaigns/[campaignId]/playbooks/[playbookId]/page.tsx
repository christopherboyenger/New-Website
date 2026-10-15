import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { platformLabels } from "@/domain/campaign";
import { contentFormatLabels } from "@/domain/playbook-content";
import { submitPostAction } from "@/server/creator/actions";
import { loadCreatorContext, requireCreatorPage } from "@/server/creator/context";
import { adProvidersFor, adRightsTermsText, CAPTION_MAX_LENGTH, loadCreatorPlaybook } from "@/server/creator/fulfillment";
import { Badge } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/layout";
import { formatUtcDate } from "@/components/creators/format";
import { PlaybookScript } from "@/components/creator/playbook-script";
import { SubmitPostForm, type SubmitAccountOption } from "@/components/creator/submit-post-form";

type Params = Promise<{ campaignId: string; playbookId: string }>;

const adPlacementLabels = { meta_ads: "Meta (Instagram and Facebook) ads", tiktok_ads: "TikTok ads" } as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { campaignId, playbookId } = await params;
  const ctx = await loadCreatorContext();
  const view = ctx ? await loadCreatorPlaybook(ctx, campaignId, playbookId) : null;
  return { title: view ? view.playbook.name : "Playbook" };
}

/**
 * The published playbook for an admitted creator, with their own variation
 * of the script, and the form to submit the resulting post. Drafts, other
 * campaigns' playbooks and paused campaigns are not found.
 */
export default async function CreatorPlaybookPage({ params }: { params: Params }) {
  const { campaignId, playbookId } = await params;
  const ctx = await requireCreatorPage(`/creator/campaigns/${encodeURIComponent(campaignId)}/playbooks/${encodeURIComponent(playbookId)}`);
  const view = await loadCreatorPlaybook(ctx, campaignId, playbookId);
  if (!view) notFound();

  const accounts: SubmitAccountOption[] = view.accounts.map((a) => ({
    id: a.id,
    platform: a.platform,
    handle: a.handle,
    adPlacements: adProvidersFor(a.platform).map((p) => adPlacementLabels[p]),
  }));
  const platformsLine = view.campaign.targetPlatforms.length ? view.campaign.targetPlatforms.map((p) => platformLabels[p]).join(", ") : "Any supported platform";

  return (
    <>
      <Link href={`/creator/campaigns/${view.campaign.id}`} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink md:min-h-0">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {view.campaign.name}
      </Link>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{view.campaign.brandName}</p>
      <h1 className="mt-1 text-xl font-semibold leading-7 text-ink">{view.playbook.name}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <Badge>{contentFormatLabels[view.playbook.format]}</Badge>
        <Badge>#{view.campaign.primaryHashtag}</Badge>
        <span>
          Post on {platformsLine} · Published <time dateTime={view.playbook.publishedAt}>{formatUtcDate(view.playbook.publishedAt)}</time>
        </span>
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <PlaybookScript variation={view.variation} />
        <div className="lg:sticky lg:top-6">
          <Card>
            <CardHeader title="Submit your post" description="After posting on your own account, send the link here. The brand reviews every post." />
            <CardBody>
              <SubmitPostForm
                submitAction={submitPostAction.bind(null, { campaignId: view.campaign.id, playbookId: view.playbook.id })}
                primaryHashtag={view.campaign.primaryHashtag}
                accounts={accounts}
                adTermsText={adRightsTermsText(view.campaign.brandName)}
                captionMaxLength={CAPTION_MAX_LENGTH}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
