import type { ReactNode } from "react";
import Link from "next/link";
import { Check, Hash } from "lucide-react";
import { contentFormatLabels } from "@/domain/playbook-content";
import type { DiscoveredCampaign } from "@/server/campaign-admission";
import { Badge } from "@/components/ui/feedback";
import { AdmissionBadge } from "./status-badges";

/**
 * A campaign as a creator sees it: brand, campaign hashtag, format and what
 * the campaign requires. No payout rates or reach figures: no rate model
 * exists, and promises would be fabricated.
 */
export function CampaignCard({ campaign, action }: { campaign: DiscoveredCampaign; action?: ReactNode }) {
  const href = `/creator/campaigns/${campaign.id}`;
  return (
    <article className="flex flex-col gap-4 rounded-[12px] border border-line bg-surface p-5 sm:flex-row sm:items-start sm:justify-between" aria-labelledby={`campaign-${campaign.id}`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{campaign.brandName}</p>
        <h3 id={`campaign-${campaign.id}`} className="mt-1 text-[15px] font-semibold text-ink">
          <Link href={href} className="hover:underline">
            {campaign.name}
          </Link>
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge>
            <Hash className="size-3" aria-hidden="true" />
            {campaign.primaryHashtag}
          </Badge>
          <Badge>{contentFormatLabels[campaign.format]}</Badge>
          {campaign.admission ? <AdmissionBadge status={campaign.admission} /> : null}
          {campaign.full && campaign.admission !== "approved" ? <Badge tone="warning">Full</Badge> : null}
        </div>
        {campaign.brandDescription ? <p className="mt-3 line-clamp-2 text-sm text-ink-2">{campaign.brandDescription}</p> : null}
        <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-2">
          {campaign.requirements.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </article>
  );
}
