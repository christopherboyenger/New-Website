import { requireOrgPage } from "@/server/authz";
import { PageContainer, PageHeader } from "@/components/ui/layout";

// PLACEHOLDER — replaced by the playbooks feature area.
export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org } = await params;
  await requireOrgPage(org);
  return (
    <PageContainer>
      <PageHeader title="Playbook editor" description="Not built yet." />
    </PageContainer>
  );
}
