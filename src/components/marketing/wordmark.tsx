import Link from "next/link";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";

/** Text wordmark from site config with a neutral accent mark (no reference logo). */
export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-[6px] text-white", className)} aria-label={`${site.name} home`}>
      <span aria-hidden="true" className="grid size-6 place-items-center rounded-[6px] bg-accent">
        <span className="size-2 rounded-full bg-white" />
      </span>
      <span aria-hidden="true" className="text-[22px] leading-none font-semibold tracking-tight">
        {site.wordmark}
      </span>
    </Link>
  );
}
