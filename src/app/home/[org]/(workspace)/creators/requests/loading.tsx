import { Skeleton } from "@/components/ui/feedback";

/** Stable-size skeleton of the join-request queue (header and table). */
export default function JoinRequestsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading join requests…</span>
      </div>
      <div aria-hidden="true">
        <Skeleton className="mb-3 h-5 w-24" />
        <Skeleton className="mb-2 h-7 w-40" />
        <Skeleton className="mb-6 h-5 w-full max-w-2xl" />
        <Skeleton className="h-[280px] rounded-[12px]" />
      </div>
    </div>
  );
}
