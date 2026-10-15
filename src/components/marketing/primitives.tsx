import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Marketing call-to-action link: accent (primary) or white (secondary), with the ↗ glyph. */
export function CtaLink({ href, variant = "accent", children, className }: { href: string; variant?: "accent" | "light" | "outline"; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-1.5 rounded-[8px] px-6 text-[15px] font-medium transition-colors",
        variant === "accent" && "bg-accent text-white hover:bg-accent-hover",
        variant === "light" && "bg-white text-black hover:bg-white/85",
        variant === "outline" && "border border-white/25 text-white hover:border-white/60",
        className,
      )}
    >
      {children}
      <ArrowUpRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

/** Small uppercase label with the accent square, used above section headings. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-white/80 uppercase", className)}>
      <span aria-hidden="true" className="size-2 bg-accent" />
      {children}
    </p>
  );
}

export function Section({ id, labelledBy, className, children }: { id?: string; labelledBy?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("scroll-mt-20 border-t border-white/10", className)}>
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">{children}</div>
    </section>
  );
}

export function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow?: string; title: ReactNode; intro?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      {eyebrow ? <Eyebrow className="mb-4">{eyebrow}</Eyebrow> : null}
      <h2 id={id} className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
        {title}
      </h2>
      {intro ? <p className="mt-4 text-base leading-relaxed text-white/65 sm:text-lg">{intro}</p> : null}
    </div>
  );
}

/** Page hero for secondary public pages (pricing, creators, how it works). */
export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: ReactNode; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-36 pb-16 sm:px-6 sm:pt-44 sm:pb-20 lg:px-8">
      <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
      <h1 className="max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">{title}</h1>
      {intro ? <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/65">{intro}</p> : null}
      {children}
    </div>
  );
}
