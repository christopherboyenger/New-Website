import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { parseOrganicState, serializeOrganicState } from "@/domain/organic-url-state";
import { hasPermission, loadOrgContext, requireOrgPage } from "@/server/authz";
import { countListedPosts, listCampaignChooser, loadOrganicCounts, resolveFilterLabels } from "@/server/organic";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/layout";
import { CreatePlaybookDialog } from "@/components/reporting/create-playbook-dialog";
import { CampaignsSection, PlaybooksSection, PostsSection, type SectionContext } from "@/components/reporting/organic-sections";
import { OrganicTabs } from "@/components/reporting/organic-tabs";
import { OrganicSectionSkeleton } from "@/components/reporting/skeletons";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Organic · ${ctx.org.name}` : "Organic" };
}

/**
 * Organic reporting (L02–L04, L23, L33–L36). All view state lives in the URL
 * (src/domain/organic-url-state.ts), so reload and Back/Forward restore it;
 * malformed values fall back to defaults. Data loads per tab behind a
 * Suspense boundary keyed by the state, so a new state shows a skeleton
 * instead of the previous state's numbers.
 */
export default async function OrganicPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/campaigns`);
  const state = parseOrganicState(await searchParams);
  const basePath = `/home/${ctx.org.slug}/campaigns`;
  const orgId = ctx.org.id;
  const canManage = hasPermission(ctx, "campaign:manage");
  const canEditPlaybooks = hasPermission(ctx, "playbook:edit");
  const campaignFilter = state.campaign && state.campaign !== "0" ? state.campaign : null;

  const [counts, posts, labels, chooser] = await Promise.all([
    loadOrganicCounts(orgId, campaignFilter),
    countListedPosts(orgId, { campaign: state.campaign, playbook: state.playbook, platform: state.platform, range: state.range, mode: state.mode, review: state.review }),
    resolveFilterLabels(orgId, { campaign: campaignFilter, playbook: null }),
    state.tab === "playbooks" && canEditPlaybooks ? listCampaignChooser(orgId) : Promise.resolve(null),
  ]);
  const section: SectionContext = { orgId, slug: ctx.org.slug, basePath, state };
  const newCampaignHref = `/home/${ctx.org.slug}/campaigns/new`;

  return (
    <PageContainer className="pt-8 sm:pt-10">
      <PageHeader
        title="Organic"
        className="mb-4"
        actions={
          <>
            <DateRangePicker value={state.range} />
            {state.tab === "campaigns" ? (
              canManage ? (
                <ButtonLink href={newCampaignHref} size="sm" className="max-md:min-h-11">
                  <Plus className="size-3.5" aria-hidden="true" />
                  New Campaign
                </ButtonLink>
              ) : (
                <span className="flex items-center gap-2">
                  <Button size="sm" disabled aria-describedby="new-campaign-reason">
                    <Plus className="size-3.5" aria-hidden="true" />
                    New Campaign
                  </Button>
                  <span id="new-campaign-reason" className="max-w-[180px] text-xs leading-4 text-muted">
                    Only workspace owners can create campaigns.
                  </span>
                </span>
              )
            ) : null}
            {state.tab === "playbooks" && chooser ? (
              <CreatePlaybookDialog slug={ctx.org.slug} campaigns={chooser} initialCampaignId={campaignFilter} newCampaignHref={canManage ? newCampaignHref : null} />
            ) : null}
          </>
        }
      />
      <OrganicTabs basePath={basePath} state={state} counts={{ ...counts, posts }} campaignFilter={labels.campaign} />
      <Suspense key={serializeOrganicState(state).toString()} fallback={<OrganicSectionSkeleton tab={state.tab} />}>
        {state.tab === "campaigns" ? (
          <CampaignsSection ctx={section} canManage={canManage} />
        ) : state.tab === "playbooks" ? (
          <PlaybooksSection ctx={section} canPublish={hasPermission(ctx, "playbook:publish")} canEdit={canEditPlaybooks} />
        ) : (
          <PostsSection ctx={section} canManage={canManage} />
        )}
      </Suspense>
    </PageContainer>
  );
}
