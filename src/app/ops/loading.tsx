import { PageContainer } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/feedback";

export default function OpsLoading() {
  return (
    <PageContainer>
      <span className="sr-only" role="status">Loading…</span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-[12px]" />
        ))}
      </div>
      <Skeleton className="mt-6 h-64 rounded-[12px]" />
    </PageContainer>
  );
}
