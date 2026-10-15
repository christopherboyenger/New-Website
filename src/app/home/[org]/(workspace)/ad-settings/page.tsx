import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadOrgContext, requireOrgPage } from "@/server/authz";
import { loadAdSettings } from "@/server/ad-settings";
import { AdSettingsForm } from "@/components/ads/ad-settings-form";
import { PageContainer } from "@/components/ui/layout";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Ad settings · ${ctx.org.name}` : "Ad settings" };
}

/** Ad settings (L11, L26–L28). Owners edit; Members read. Defaults apply to new launches only. */
export default async function AdSettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  await requireOrgPage(slug, `/home/${slug}/ad-settings`);
  const result = await loadAdSettings(slug);
  if (!result.ok) {
    if (result.code === "not_found") notFound();
    throw new Error(result.error);
  }
  const { org, settings, version, canEdit } = result.data;
  return (
    <PageContainer className="pt-8 sm:pt-10" width="medium">
      {/* Keyed by version so "Reload latest" (router.refresh) remounts with the saved settings. */}
      <AdSettingsForm key={version} slug={org.slug} initial={settings} version={version} canEdit={canEdit} />
    </PageContainer>
  );
}
