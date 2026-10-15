import { cn } from "@/lib/cn";
import { initials } from "./format";

/** Initials placeholder: no creator image is shown until a media-use arrangement covers it. */
export function CreatorAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-selected font-semibold text-ink-2",
        size === "sm" ? "size-7 text-[11px]" : "size-12 text-base",
      )}
    >
      {initials(name)}
    </span>
  );
}
