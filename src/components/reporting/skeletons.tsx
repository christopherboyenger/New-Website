import { Skeleton } from "@/components/ui/feedback";
import type { OrganicTab } from "@/domain/organic-url-state";

/** Stable-size placeholders: loading never shows a temporary zero as a settled result. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="space-y-0 divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3.5">
            <Skeleton className="size-4" />
            <Skeleton className="h-5 w-9 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-4 w-16" />
            <Skeleton className="hidden h-4 w-16 sm:block" />
            <Skeleton className="hidden h-4 w-14 md:block" />
            <Skeleton className="hidden h-4 w-20 lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PostsSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-8 w-40" />
      <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="min-h-[128px] rounded-[12px] border border-line p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-28" />
            <Skeleton className="mt-2 h-3 w-36" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[12px] border border-line p-4">
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="mt-4 h-[220px] w-full" />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="ml-auto h-8 w-56" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-[12px]" />
        ))}
      </div>
    </div>
  );
}

export function OrganicSectionSkeleton({ tab }: { tab: OrganicTab }) {
  return (
    <div>
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading {tab}…</span>
      </div>
      {tab === "posts" ? <PostsSkeleton /> : <TableSkeleton />}
    </div>
  );
}
