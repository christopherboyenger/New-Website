import { requireOrgPage } from "@/server/authz";
import { PageContainer, PageHeader } from "@/components/ui/layout";

// PLACEHOLDER — replaced by the owning feature area.
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  await requireOrgPage(org);
  return (
    <PageContainer>
      <PageHeader title="Ads" description="Not built yet." />
    </PageContainer>
  );
}
