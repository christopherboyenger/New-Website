import { requireOrgPage, hasPermission } from "@/server/authz";
import { Sidebar } from "@/components/workspace/sidebar";
import { buildVersion } from "@/config/build";

/**
 * Ordinary workspace shell: fixed 256px sidebar + scrolling main panel.
 * Specialized editors (campaign creation, playbook editor, ad creation) live
 * in the sibling (editor) route group with their own shell.
 * Authorization is re-checked by every page and action; this layout check
 * is only for rendering the shell.
 */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug);
  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh shrink-0 md:block">
        <Sidebar orgSlug={ctx.org.slug} orgName={ctx.org.name} canViewBilling={hasPermission(ctx, "billing:view")} version={buildVersion()} />
      </aside>
      <main id="main" className="min-w-0 flex-1 bg-surface md:my-2 md:mr-2 md:rounded-[12px] md:border md:border-line">
        {children}
      </main>
    </div>
  );
}
