import type { Metadata } from "next";
import { RICH_TEXT_MAX_CHARS } from "@/domain/rich-text";
import { loadOrgContext, requireOrgPage } from "@/server/authz";
import { brandCategories, DEFAULT_BRAND_COLOR, loadBrandingPage } from "@/server/branding";
import { BrandingForm } from "@/components/branding/branding-form";
import { LeaveTeam } from "@/components/members/leave-team";
import { leaveWorkspaceAction } from "../members/actions";
import { saveBrandingAction } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Branding · ${ctx.org.name}` : "Branding" };
}

/** Branding (L12): brand basics, identity, sanitized description, links, live preview and the Danger zone. */
export default async function BrandingPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/branding`);
  const data = loadBrandingPage(ctx);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <BrandingForm
        key={data.branding.version}
        initial={data.branding}
        canEdit={data.canEdit}
        categories={brandCategories}
        maxDescription={RICH_TEXT_MAX_CHARS}
        defaultColor={DEFAULT_BRAND_COLOR}
        mediaStorage={data.mediaStorage}
        saveAction={saveBrandingAction.bind(null, ctx.org.slug)}
        dangerZone={<LeaveTeam workspaceName={ctx.org.name} isPrimaryOwner={ctx.actor.isPrimaryOwner} leaveAction={leaveWorkspaceAction.bind(null, ctx.org.slug)} />}
      />
    </div>
  );
}
