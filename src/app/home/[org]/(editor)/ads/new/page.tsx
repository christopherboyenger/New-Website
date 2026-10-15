import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { loadOrgContext, requireOrgPage } from "@/server/authz";
import { loadLaunchDraftForm } from "@/server/ads";
import { AdAccountPrerequisite } from "@/components/ads/ads-display";
import { LaunchDraftForm } from "@/components/ads/launch-draft-form";
import { ButtonLink } from "@/components/ui/button";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Create ads · ${ctx.org.name}` : "Create ads" };
}

/**
 * /home/{org}/ads/new?pick=1 — specialized page without the sidebar (L38).
 * Without a connected Meta/TikTok ad account it stops at the prerequisite;
 * with one, owners build a launch draft. Members get a read-only explanation.
 */
export default async function CreateAdsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  await requireOrgPage(slug, `/home/${slug}/ads/new?pick=1`);
  const result = await loadLaunchDraftForm(slug);
  if (!result.ok) {
    if (result.code === "not_found") notFound();
    throw new Error(result.error);
  }
  const data = result.data;
  const adsHref = `/home/${data.org.slug}/ads`;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-1.5 px-2 md:px-4 lg:px-6">
          <nav aria-label="Breadcrumb">
            <Link href={adsHref} className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink max-md:min-h-11">
              <ChevronLeft className="size-4" aria-hidden="true" />
              Back to Ads
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <h1 className="mb-6 text-xl font-semibold leading-7 text-ink">Create ads</h1>
        {!data.canLaunch ? (
          <section aria-labelledby="read-only-title" className="mx-auto max-w-xl rounded-[12px] border border-line bg-surface px-6 py-8 text-center">
            <span className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-full bg-selected text-ink-2">
              <Lock className="size-5" aria-hidden="true" />
            </span>
            <h2 id="read-only-title" className="text-lg font-semibold text-ink">
              Only workspace owners can create ads.
            </h2>
            <p className="mt-2 text-sm text-muted">
              You&apos;re a Member of {data.org.name}. Members can see ads and submissions, but creating an ad needs a workspace Owner.
            </p>
            <ButtonLink href={adsHref} variant="secondary" className="mt-6 max-md:min-h-11">
              Back to Ads
            </ButtonLink>
          </section>
        ) : !data.connection.connected.length ? (
          <AdAccountPrerequisite
            message="Connect a Meta or TikTok ad account before running posts as ads."
            integrationsHref={`/home/${data.org.slug}/integrations`}
            installations={data.connection.installations}
          />
        ) : (
          <LaunchDraftForm data={data} />
        )}
      </main>
    </>
  );
}
