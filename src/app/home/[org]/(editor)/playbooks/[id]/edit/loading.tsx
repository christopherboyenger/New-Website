import { Skeleton } from "@/components/ui/feedback";

/** Stable-size placeholder while the playbook loads (never a provisional zero). */
export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <span className="sr-only" role="status">
        Loading playbook…
      </span>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex h-[57px] max-w-[1440px] items-center gap-3 px-4 md:px-6">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="ml-auto h-9 w-48" />
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-[1440px] gap-6 px-4 py-5 md:px-6 lg:grid-cols-[272px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[74px] w-full rounded-[12px]" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-48 w-full rounded-[12px]" />
          <Skeleton className="h-24 w-full rounded-[12px]" />
          <Skeleton className="h-64 w-full rounded-[12px]" />
        </div>
        <Skeleton className="mx-auto hidden h-[600px] w-[300px] rounded-[36px] xl:block" />
      </div>
    </div>
  );
}
