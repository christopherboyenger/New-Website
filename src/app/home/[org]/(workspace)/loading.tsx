import { Skeleton } from "@/components/ui/feedback";
import { PageContainer } from "@/components/ui/layout";
import { CardSkeleton } from "@/components/workspace/skeletons";

/**
 * Navigation fallback for every workspace page that has no loading state of
 * its own: a neutral page skeleton (title, toolbar, content blocks) with
 * stable sizes, so no temporary zero or empty state is shown as fact.
 */
export default function WorkspaceLoading() {
  return (
    <PageContainer className="pt-8 sm:pt-10">
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading…</span>
      </div>
      <div aria-hidden="true">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <CardSkeleton className="h-[212px]" />
          <CardSkeleton className="h-[212px]" />
        </div>
        <CardSkeleton className="mt-8 h-[240px]" />
      </div>
    </PageContainer>
  );
}
