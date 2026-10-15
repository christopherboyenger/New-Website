import type { Metadata } from "next";
import Link from "next/link";
import { discoverCampaigns } from "@/server/campaign-admission";
import { joinCampaignAction } from "@/server/creator/actions";
import { requireCreatorPage } from "@/server/creator/context";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { CampaignCard } from "@/components/creator/campaign-card";
import { JoinButton } from "@/components/creator/join-button";

export const metadata: Metadata = { title: "Campaigns" };

/**
 * Campaign discovery: the creator's campaigns (joined or awaiting approval)
 * and the active campaigns they are eligible for. Only campaigns with a
 * published, active playbook are listed.
 */
export default async function CreatorCampaignsPage() {
  const ctx = await requireCreatorPage("/creator/campaigns");
  const discovery = await discoverCampaigns(ctx);

  return (
    <>
      <h1 className="text-xl font-semibold leading-7 text-ink">Campaigns</h1>
      <p className="mt-1 text-sm text-muted">Active campaigns that match your country, level and linked platforms.</p>

      {discovery.mine.length > 0 ? (
        <section aria-labelledby="mine-title" className="mt-6">
          <h2 id="mine-title" className="mb-3 text-[15px] font-semibold text-ink">
            Your campaigns
          </h2>
          <div className="flex flex-col gap-3">
            {discovery.mine.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                action={
                  <Link href={`/creator/campaigns/${campaign.id}`} className={buttonClasses("secondary", "md", "max-md:h-11 max-sm:w-full")}>
                    {campaign.admission === "approved" ? "Open playbooks" : "View"}
                  </Link>
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="available-title" className="mt-8">
        <h2 id="available-title" className="mb-3 text-[15px] font-semibold text-ink">
          Open to you
        </h2>
        {!discovery.hasAccounts ? (
          <div className="rounded-[12px] border border-line bg-surface">
            <EmptyState
              title="Link a social account first"
              description="Campaigns are matched to the platforms you post on. Add the accounts you'll post from to see campaigns you can join."
              action={
                <Link href="/creator/profile#accounts" className={buttonClasses("primary", "md", "max-md:h-11")}>
                  Add a social account
                </Link>
              }
            />
          </div>
        ) : discovery.available.length === 0 ? (
          <div className="rounded-[12px] border border-line bg-surface">
            <EmptyState
              title="No open campaigns match your profile right now"
              description="New campaigns appear here when brands publish a playbook for creators like you. Linking accounts on more platforms can widen your matches."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {discovery.available.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                action={
                  campaign.full ? (
                    <p className="text-sm text-muted sm:max-w-48 sm:text-right">This campaign has reached its creator limit.</p>
                  ) : (
                    <JoinButton
                      campaignId={campaign.id}
                      campaignName={campaign.name}
                      requiresApproval={campaign.approvals.requireCreatorApproval}
                      joinAction={joinCampaignAction}
                    />
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
