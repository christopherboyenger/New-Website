import Link from "next/link";
import { MailWarning } from "lucide-react";
import { buildVersion } from "@/config/build";
import { planDisplayName } from "@/config/commercial-policy";
import { site } from "@/config/site";
import { hasFeature } from "@/domain/entitlements";
import { hasPermission, listUserOrganizations, requireOrgPage } from "@/server/authz";
import { loadShellState } from "@/server/home";
import { getUnreadMessageCountAction } from "@/server/messages";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

/**
 * Ordinary workspace shell: sidebar + scrolling main panel + search + messages
 * dock. Specialized editors (campaign creation, playbook editor, ad creation)
 * live in the sibling (editor) route group with their own shell.
 * Authorization is re-checked by every page and action; this layout check is
 * only for rendering the shell.
 */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug);
  const [shell, memberships, unread] = await Promise.all([
    loadShellState(ctx.user.id, ctx.org.id),
    listUserOrganizations(ctx.user.id),
    getUnreadMessageCountAction(ctx.org.slug),
  ]);
  const canViewBilling = hasPermission(ctx, "billing:view");
  const userName = `${ctx.user.firstName} ${ctx.user.lastName}`.trim() || ctx.user.email;

  return (
    <WorkspaceShell
      org={{ slug: ctx.org.slug, name: ctx.org.name }}
      organizations={memberships.map(({ org }) => ({ slug: org.slug, name: org.name }))}
      user={{ name: userName, email: ctx.user.email }}
      canViewBilling={canViewBilling}
      version={buildVersion()}
      resources={{ docsUrl: site.docsUrl, supportEmail: site.supportEmail }}
      initialCollapsed={shell.sidebarCollapsed}
      messages={{
        initialState: shell.messagesDockState,
        initialUnread: unread.ok ? unread.data.unread : null,
        creatorMessagingIncluded: hasFeature(ctx.org.planId, "creator_messaging"),
        creatorMessagingPlanName: planDisplayName("unlimited"),
        billingHref: canViewBilling ? `/home/${ctx.org.slug}/billing` : null,
        supportEmail: site.supportEmail,
      }}
      banner={ctx.user.emailVerifiedAt ? null : <VerifyEmailBanner />}
    >
      {children}
    </WorkspaceShell>
  );
}

function VerifyEmailBanner() {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-warning-line bg-warning-soft px-4 py-2 text-[13px] text-ink-2 md:rounded-t-[12px] md:px-6">
      <MailWarning className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <span>Your email address isn&apos;t verified yet.</span>
      <Link href="/auth/verify" className="font-medium text-ink underline underline-offset-2">
        Verify your email
      </Link>
    </div>
  );
}
