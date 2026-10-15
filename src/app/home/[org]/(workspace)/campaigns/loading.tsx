import { Skeleton } from "@/components/ui/feedback";
import { PageContainer } from "@/components/ui/layout";
import { TableSkeleton } from "@/components/reporting/skeletons";

/** Route-level fallback while the Organic page resolves: header, tabs and a table placeholder at their final sizes. */
export default function OrganicLoading() {
  return (
    <PageContainer className="pt-8 sm:pt-10">
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading Organic…</span>
      </div>
      <div aria-hidden="true">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-8 w-60" />
        </div>
        <div className="mb-5 flex gap-4 border-b border-line pb-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
        <TableSkeleton />
      </div>
    </PageContainer>
  );
}
