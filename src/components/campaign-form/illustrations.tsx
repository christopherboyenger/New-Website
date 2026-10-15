import type { ContentFormat } from "@/domain/playbook-content";
import { cn } from "@/lib/cn";

/**
 * Neutral geometric illustrations for the Content choice. They stand in for
 * example media until approved assets exist (production-ui-plan.md "Asset
 * requirements"): no people, faces, creator posts or performance numbers.
 */
const ink = "var(--color-ink)";
const line = "var(--color-line-strong)";
const soft = "var(--color-selected)";
const accent = "var(--color-accent)";

export function FormatIllustration({ format, className }: { format: ContentFormat; className?: string }) {
  return (
    <svg viewBox="0 0 240 132" className={cn("mb-2 h-auto w-full rounded-[8px]", className)} aria-hidden="true" focusable="false">
      <rect width="240" height="132" rx="8" fill="var(--color-canvas)" />
      {format === "slideshow" ? (
        <>
          <rect x="126" y="20" width="56" height="98" rx="8" fill={soft} stroke={line} transform="rotate(9 154 69)" />
          <rect x="112" y="18" width="56" height="98" rx="8" fill="white" stroke={line} transform="rotate(3 140 67)" />
          <rect x="92" y="16" width="56" height="98" rx="8" fill={ink} />
          <rect x="100" y="34" width="40" height="28" rx="4" fill={accent} opacity="0.9" />
          <rect x="100" y="70" width="40" height="6" rx="3" fill="white" />
          <rect x="100" y="81" width="26" height="6" rx="3" fill="white" opacity="0.6" />
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx={102 + i * 9} cy={104} r="2.5" fill="white" opacity={i === 0 ? 1 : 0.4} />
          ))}
        </>
      ) : (
        <>
          <rect x="92" y="12" width="56" height="108" rx="10" fill={ink} />
          <rect x="98" y="20" width="44" height="92" rx="6" fill={soft} opacity="0.25" />
          <circle cx="120" cy="54" r="13" fill={accent} />
          <rect x="106" y="74" width="28" height="22" rx="11" fill={accent} opacity="0.55" />
          <rect x="102" y="26" width="36" height="6" rx="3" fill="white" opacity="0.85" />
          <circle cx="133" cy="100" r="4" fill="white" opacity="0.8" />
          <rect x="52" y="44" width="28" height="20" rx="6" fill="white" stroke={line} />
          <path d="M62 50 l8 4 l-8 4 z" fill={ink} />
          <rect x="160" y="64" width="34" height="16" rx="8" fill="white" stroke={line} />
          <rect x="167" y="70" width="20" height="4" rx="2" fill={line} />
        </>
      )}
    </svg>
  );
}
