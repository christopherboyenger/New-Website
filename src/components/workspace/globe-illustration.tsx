import { cn } from "@/lib/cn";

const C = 300;
const R = 284;
/** Meridians every 20° (each ellipse draws the ±λ pair); parallels every 20°. */
const meridianOffsets = [20, 40, 60, 80];
const parallels = [-60, -40, -20, 0, 20, 40, 60];

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Calm, static graticule globe for Live. It deliberately carries no location
 * marks: no permitted city-level location source exists, so nothing is
 * plotted rather than inventing activity. Static, so reduced motion needs no
 * special handling.
 */
export function GlobeIllustration({ label, className }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 600 600" role="img" aria-label={label} className={cn("aspect-square", className)}>
      <defs>
        <radialGradient id="globe-shade" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="var(--color-surface)" />
          <stop offset="70%" stopColor="var(--color-canvas)" />
          <stop offset="100%" stopColor="var(--color-selected)" />
        </radialGradient>
        <clipPath id="globe-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} fill="url(#globe-shade)" />
      <g clipPath="url(#globe-clip)" fill="none" stroke="var(--color-line-strong)" strokeWidth={1} opacity={0.55}>
        <line x1={C} y1={C - R} x2={C} y2={C + R} />
        {meridianOffsets.map((deg) => (
          <ellipse key={deg} cx={C} cy={C} rx={R * Math.sin(rad(deg))} ry={R} />
        ))}
        {parallels.map((deg) => {
          const y = C - R * Math.sin(rad(deg));
          const half = R * Math.cos(rad(deg));
          return <line key={deg} x1={C - half} y1={y} x2={C + half} y2={y} />;
        })}
      </g>
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--color-line-strong)" strokeWidth={1.5} />
    </svg>
  );
}
