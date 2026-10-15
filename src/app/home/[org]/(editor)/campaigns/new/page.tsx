import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { permissionDeniedMessages } from "@/domain/permissions";
import { requireOrgPage } from "@/server/authz";
import { loadNewCampaignFormAction } from "@/server/campaign-form";
import { CampaignForm } from "@/components/campaign-form/campaign-form";
import { EditorTopBar } from "@/components/campaign-form/top-bar";

export const metadata: Metadata = { title: "New campaign" };

/**
 * /home/{org}/campaigns/new — specialized campaign creation workspace
 * (L17–L22, production-ui-plan.md). Owners get the form; Members get a
 * read-only explanation. Authorization is re-checked by every action.
 */
export default async function NewCampaignPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  await requireOrgPage(slug, `/home/${slug}/campaigns/new`);
  const result = await loadNewCampaignFormAction(slug);
  if (!result.ok) {
    if (result.code === "not_found") notFound();
    throw new Error(result.error);
  }
  const data = result.data;
  const backHref = `/home/${data.org.slug}/campaigns?tab=campaigns`;

  if (!data.canManage || !data.initialForecast) {
    return (
      <>
        <EditorTopBar backHref={backHref} />
        <main className="mx-auto max-w-xl px-4 py-12 md:py-20">
          <section aria-labelledby="read-only-title" className="rounded-[12px] border border-line bg-surface px-6 py-8 text-center">
            <span className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-full bg-selected text-ink-2">
              <Lock className="size-5" aria-hidden="true" />
            </span>
            <h2 id="read-only-title" className="text-lg font-semibold text-ink">
              {permissionDeniedMessages["campaign:manage"]}
            </h2>
            <p className="mt-2 text-sm text-muted">
              You&apos;re a Member of {data.org.name}. Members can view campaigns and reporting, but creating or changing a campaign needs a workspace
              Owner. Ask an Owner to create it, or to change your role.
            </p>
            <ButtonLink href={backHref} variant="secondary" className="mt-6 max-md:min-h-11">
              Back to Campaigns
            </ButtonLink>
          </section>
        </main>
      </>
    );
  }

  return (
    <CampaignForm
      slug={data.org.slug}
      orgName={data.org.name}
      backHref={backHref}
      entitlements={data.entitlements}
      gate={{ planName: data.unlimitedPlanName, billingHref: data.billingHref }}
      recommendedHashtags={data.recommendedHashtags}
      hashtagPlaceholder={data.hashtagPlaceholder}
      initialForecast={data.initialForecast}
    />
  );
}
