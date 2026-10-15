import { requireOrgPage } from "@/server/authz";

/**
 * Specialized workspaces (campaign creation, playbook editor, ad creation) do
 * not inherit the ordinary sidebar shell. Each page renders its own header.
 */
export default async function EditorLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  await requireOrgPage(slug);
  return <div className="min-h-dvh bg-canvas">{children}</div>;
}
