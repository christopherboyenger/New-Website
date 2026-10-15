import { AlertTriangle } from "lucide-react";
import type { RollingCounters } from "@/server/home";
import { formatCount } from "@/lib/money";
import { cn } from "@/lib/cn";
import { formatAge, formatUtcInstant } from "./format";

/** Observations older than this make the 60-minute counter unreliable, so it is flagged as possibly behind. */
const STALE_AFTER_MS = 60 * 60_000;

/**
 * "Views last 24 hours" / "Views last 60 minutes" (L01, L09). An unavailable
 * counter renders "—" with its reason, never 0 (DEC-013); a confirmed empty
 * workspace shows 0. Freshness comes from the latest metric observation.
 */
export function RollingViewCounters({ counters, size = "md", className }: { counters: RollingCounters; size?: "md" | "lg"; className?: string }) {
  const items = [
    { label: "Views last 24 hours", value: counters.last24h },
    { label: "Views last 60 minutes", value: counters.last60m },
  ];
  const unavailable = items.map((i) => i.value).find((v) => v.status === "unavailable");
  const observed = items
    .map((i) => (i.value.status === "available" ? i.value.observedThrough : null))
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const stale = observed ? counters.generatedAt.getTime() - observed.getTime() > STALE_AFTER_MS : false;

  return (
    <div className={className}>
      <dl className="flex flex-wrap items-stretch gap-y-3">
        {items.map((item, index) => (
          <div key={item.label} className={cn("min-w-0 pr-6", index > 0 && "border-l border-line pl-6")}>
            <dt className="text-[13px] text-muted">{item.label}</dt>
            <dd className={cn("mt-0.5 font-semibold text-ink", size === "lg" ? "text-[32px] leading-10" : "text-[28px] leading-9")}>
              {item.value.status === "available" ? (
                formatCount(item.value.value)
              ) : (
                <>
                  <span aria-hidden="true" className="text-muted">
                    —
                  </span>
                  <span className="sr-only">Unavailable</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className={cn("mt-2 flex items-start gap-1.5 text-[12px] leading-5", stale ? "text-warning" : "text-muted")}>
        {stale ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span>
          {unavailable?.status === "unavailable"
            ? unavailable.reason
            : observed
              ? stale
                ? `No new observations since ${formatUtcInstant(observed)} (${formatAge(observed, counters.generatedAt)}), so recent counts may be behind.`
                : `Updated through ${formatUtcInstant(observed)} · ${formatAge(observed, counters.generatedAt)}`
              : "Counting starts when creators publish approved posts for your campaigns."}
        </span>
      </p>
    </div>
  );
}
