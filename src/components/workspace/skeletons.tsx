import { Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";

/** Stable-size loading placeholders for Home and the workspace navigation fallback. */

export function CountersSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex gap-6">
        {[0, 1].map((i) => (
          <div key={i} className={cn("flex flex-col gap-2", i > 0 && "border-l border-line pl-6")}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-3 h-4 w-64" />
    </div>
  );
}

/** Card-shaped placeholder with the card radius (Skeleton's own radius is for text lines). */
export function CardSkeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-[12px] bg-selected", className)} />;
}

export function MetricsSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="min-h-[212px] rounded-[12px] border border-line p-5">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="mt-5 h-9 w-24" />
            <Skeleton className="mt-4 h-[72px] w-full" />
          </div>
        ))}
      </div>
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">
        {[0, 1].map((i) => (
          <div key={i}>
            <Skeleton className="h-7 w-40" />
            <CardSkeleton className="mt-4 h-[180px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
