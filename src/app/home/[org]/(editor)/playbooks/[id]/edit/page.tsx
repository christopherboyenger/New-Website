import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaybookEditor } from "@/components/playbook-editor/playbook-editor";
import { requireOrgPage } from "@/server/authz";
import { loadPlaybookEditor } from "@/server/playbooks";

export const metadata: Metadata = { title: "Playbook editor" };

/**
 * /home/{org}/playbooks/{id}/edit — UGC or Slideshow playbook editor
 * (L05–L07; slideshow per the documented format). The playbook is loaded
 * tenant-scoped; an unknown or other-org playbook is a 404. Every action
 * re-authorizes on the server.
 */
export default async function PlaybookEditPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  await requireOrgPage(slug, `/home/${slug}/playbooks/${id}/edit`);
  const result = await loadPlaybookEditor(slug, id);
  if (!result.ok) {
    if (result.code === "not_found") notFound();
    throw new Error(result.error);
  }
  return <PlaybookEditor data={result.data} />;
}
