"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * An instant rendered in the viewer's own time zone (the API's `posted_at`
 * is UTC; only report DAYS stay UTC). The server cannot know the viewer's
 * zone, so the first render shows the UTC date labelled "UTC" and the client
 * replaces it after hydration — no mismatch, no guessed zone.
 */
export function LocalDateTime({ iso, className }: { iso: string; className?: string }) {
  const date = new Date(iso);
  const local = useSyncExternalStore(
    subscribe,
    () => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date),
    () => null,
  );
  const fallback = `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date)} UTC`;
  return (
    <time dateTime={iso} className={className}>
      {local ?? fallback}
    </time>
  );
}
