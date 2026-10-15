import { notFound } from "next/navigation";
import { requireOrgPage } from "@/server/authz";
import { getPlaybook } from "@/server/playbooks-core";

/**
 * Resolves the playbook before the editor's loading boundary (edit/loading.tsx)
 * starts streaming, so an unknown or other-workspace playbook ID returns a real
 * HTTP 404 instead of a 200 that later renders "not found". The lookup is
 * tenant-qualified with the authorized workspace; the page re-checks it.
 */
export default async function PlaybookLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/playbooks/${id}/edit`);
  if (!(await getPlaybook(ctx.org.id, id))) notFound();
  return children;
}
