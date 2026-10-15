import { Skeleton } from "@/components/ui/feedback";

/** Stable-size skeleton of the roster (tabs, three leader cards, filters, table); no temporary zeros. */
export default function CreatorsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading creators…</span>
      </div>
      <div aria-hidden="true">
        <Skeleton className="mb-4 h-7 w-32" />
        <Skeleton className="mb-5 h-9 w-72 max-w-full" />
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-[104px] rounded-[12px]" />
          <Skeleton className="h-[104px] rounded-[12px]" />
          <Skeleton className="h-[104px] rounded-[12px]" />
        </div>
        <Skeleton className="mb-3 h-9 w-full max-w-3xl" />
        <Skeleton className="h-[320px] rounded-[12px]" />
      </div>
    </div>
  );
}
