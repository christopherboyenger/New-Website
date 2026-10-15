import type { ContentFormat } from "@/domain/playbook-content";
import { cn } from "@/lib/cn";

/**
 * Neutral geometric illustrations for the onboarding wizard. They stand in
 * for licensed artwork and example media until approved assets exist
 * (production-ui-plan.md "Asset requirements"): no people, faces, creator
 * posts or performance numbers.
 */

const accent = "var(--color-accent)";
const navy = "var(--color-navy)";
const line = "var(--color-slate-line)";
const fill = "var(--color-slate-fill)";
const help = "var(--color-slate-help)";

/** Decorative composition beside the first question (desktop only). */
export function WelcomeArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 400" className={cn("h-auto w-full", className)} aria-hidden="true" focusable="false">
      <rect x="40" y="36" width="190" height="300" rx="28" fill={fill} stroke={line} strokeWidth="2" />
      <rect x="64" y="70" width="142" height="14" rx="7" fill={line} />
      <rect x="64" y="96" width="96" height="14" rx="7" fill={line} />
      <rect x="64" y="134" width="142" height="128" rx="16" fill="white" stroke={line} strokeWidth="2" />
      <circle cx="135" cy="198" r="26" fill={accent} />
      <path d="M128 186 L148 198 L128 210 Z" fill="white" />
      <rect x="64" y="282" width="68" height="28" rx="14" fill={navy} />
      <circle cx="268" cy="120" r="54" fill={accent} opacity="0.14" />
      <circle cx="268" cy="120" r="30" fill={accent} />
      <rect x="196" y="236" width="128" height="128" rx="24" fill={navy} />
      <rect x="220" y="262" width="80" height="10" rx="5" fill="white" opacity="0.8" />
      <rect x="220" y="282" width="56" height="10" rx="5" fill="white" opacity="0.5" />
      <rect x="220" y="318" width="34" height="22" rx="11" fill={accent} />
    </svg>
  );
}

/** Decorative composition above the plan summary. */
export function PlanArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 220" className={cn("h-auto w-full", className)} aria-hidden="true" focusable="false">
      <rect x="20" y="30" width="360" height="170" rx="24" fill={fill} stroke={line} strokeWidth="2" />
      <rect x="52" y="64" width="120" height="102" rx="16" fill="white" stroke={line} strokeWidth="2" />
      <rect x="72" y="88" width="80" height="10" rx="5" fill={line} />
      <rect x="72" y="108" width="56" height="10" rx="5" fill={line} />
      <rect x="72" y="134" width="40" height="16" rx="8" fill={accent} />
      <rect x="196" y="64" width="152" height="46" rx="14" fill={navy} />
      <rect x="214" y="82" width="70" height="10" rx="5" fill="white" opacity="0.8" />
      <rect x="196" y="120" width="152" height="46" rx="14" fill="white" stroke={line} strokeWidth="2" />
      <circle cx="222" cy="143" r="9" fill={accent} />
      <rect x="240" y="138" width="80" height="10" rx="5" fill={line} />
      <circle cx="348" cy="34" r="22" fill={accent} />
      <path d="M338 34 l7 7 l13 -14" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Portrait illustration for a content-format card. */
export function FormatArt({ format, className }: { format: ContentFormat; className?: string }) {
  return (
    <svg viewBox="0 0 180 240" className={cn("h-auto w-full rounded-[10px]", className)} aria-hidden="true" focusable="false">
      <rect width="180" height="240" rx="10" fill={fill} />
      {format === "slideshow" ? (
        <>
          <rect x="52" y="34" width="96" height="150" rx="10" fill={line} transform="rotate(8 100 109)" />
          <rect x="42" y="40" width="96" height="150" rx="10" fill="white" stroke={line} strokeWidth="2" transform="rotate(-4 90 115)" />
          <rect x="36" y="44" width="96" height="150" rx="10" fill={navy} />
          <rect x="50" y="74" width="68" height="44" rx="6" fill={accent} opacity="0.9" />
          <rect x="50" y="132" width="68" height="9" rx="4.5" fill="white" />
          <rect x="50" y="148" width="46" height="9" rx="4.5" fill="white" opacity="0.6" />
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx={66 + i * 12} cy={214} r="4" fill={i === 0 ? navy : line} />
          ))}
        </>
      ) : (
        <>
          <rect x="44" y="20" width="92" height="190" rx="16" fill={navy} />
          <rect x="52" y="34" width="76" height="162" rx="10" fill={help} opacity="0.35" />
          <rect x="60" y="46" width="60" height="10" rx="5" fill="white" opacity="0.9" />
          <circle cx="90" cy="118" r="20" fill={accent} />
          <path d="M84 108 L101 118 L84 128 Z" fill="white" />
          <rect x="60" y="168" width="60" height="9" rx="4.5" fill="white" />
          <rect x="68" y="182" width="44" height="7" rx="3.5" fill="white" opacity="0.6" />
          <circle cx="150" cy="60" r="8" fill={accent} opacity="0.3" />
          <circle cx="28" cy="170" r="6" fill={navy} opacity="0.15" />
        </>
      )}
    </svg>
  );
}

/** Small portrait thumbnail suggesting a template's structure. */
export function TemplateArt({ templateId, className }: { templateId: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 170" className={cn("h-auto w-full rounded-[8px]", className)} aria-hidden="true" focusable="false">
      <rect width="120" height="170" rx="8" fill={navy} />
      <TemplateShapes id={templateId} />
    </svg>
  );
}

function TemplateShapes({ id }: { id: string }) {
  switch (id) {
    case "ugc-greenscreen":
      return (
        <>
          <rect x="12" y="14" width="96" height="110" rx="6" fill="white" opacity="0.92" />
          <rect x="22" y="26" width="56" height="8" rx="4" fill={line} />
          <rect x="22" y="42" width="76" height="40" rx="5" fill={fill} stroke={line} />
          <rect x="22" y="92" width="40" height="14" rx="7" fill={accent} />
          <circle cx="30" cy="146" r="14" fill={accent} />
        </>
      );
    case "ugc-hook-demo":
      return (
        <>
          <rect x="14" y="20" width="92" height="22" rx="6" fill="white" />
          <rect x="22" y="28" width="60" height="6" rx="3" fill={navy} opacity="0.7" />
          <rect x="24" y="58" width="72" height="72" rx="10" fill={accent} opacity="0.85" />
          <path d="M53 82 L73 94 L53 106 Z" fill="white" />
          <rect x="30" y="144" width="60" height="8" rx="4" fill="white" opacity="0.6" />
        </>
      );
    case "ugc-talking-head":
      return (
        <>
          <circle cx="60" cy="74" r="28" fill={help} opacity="0.55" />
          <rect x="26" y="108" width="68" height="42" rx="20" fill={help} opacity="0.4" />
          <rect x="22" y="132" width="76" height="10" rx="5" fill="white" />
        </>
      );
    case "ugc-skit":
      return (
        <>
          <circle cx="38" cy="70" r="18" fill={accent} opacity="0.85" />
          <circle cx="82" cy="70" r="18" fill={help} opacity="0.6" />
          <rect x="18" y="98" width="40" height="40" rx="14" fill={accent} opacity="0.5" />
          <rect x="62" y="98" width="40" height="40" rx="14" fill={help} opacity="0.4" />
          <rect x="28" y="18" width="64" height="12" rx="6" fill="white" />
        </>
      );
    case "ugc-stitch":
      return (
        <>
          <rect x="8" y="10" width="104" height="70" rx="6" fill={help} opacity="0.45" />
          <rect x="18" y="20" width="70" height="8" rx="4" fill="white" opacity="0.9" />
          <rect x="8" y="88" width="104" height="72" rx="6" fill={accent} opacity="0.8" />
          <rect x="18" y="140" width="60" height="8" rx="4" fill="white" />
        </>
      );
    case "slideshow-listicle":
      return (
        <>
          <rect x="16" y="18" width="88" height="12" rx="6" fill="white" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx="26" cy={58 + i * 32} r="9" fill={i === 2 ? accent : "white"} opacity={i === 2 ? 1 : 0.85} />
              <rect x="42" y={53 + i * 32} width="58" height="10" rx="5" fill="white" opacity="0.6" />
            </g>
          ))}
        </>
      );
    case "slideshow-before-after":
      return (
        <>
          <rect x="8" y="10" width="50" height="150" rx="6" fill={help} opacity="0.45" />
          <rect x="62" y="10" width="50" height="150" rx="6" fill={accent} opacity="0.85" />
          <rect x="16" y="140" width="34" height="10" rx="5" fill="white" opacity="0.8" />
          <rect x="70" y="140" width="34" height="10" rx="5" fill="white" />
        </>
      );
    default:
      return <rect x="20" y="20" width="80" height="130" rx="8" fill={help} opacity="0.4" />;
  }
}
