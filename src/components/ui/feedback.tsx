import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock, PlugZap, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-selected text-ink-2",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent-ink",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone], className)}>{children}</span>;
}

/** "Requires Unlimited" marker next to gated controls (visual cue only — the server enforces). */
export function PlanBadge({ planName = "Unlimited", className }: { planName?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink", className)}>
      <Lock className="size-3" aria-hidden="true" />
      <span>Requires {planName}</span>
    </span>
  );
}

const alertStyles: Record<Exclude<Tone, "neutral" | "accent">, { box: string; icon: typeof Info }> = {
  info: { box: "border-info-line bg-info-soft text-info", icon: Info },
  success: { box: "border-success-line bg-success-soft text-success", icon: CheckCircle2 },
  warning: { box: "border-warning-line bg-warning-soft text-warning", icon: AlertTriangle },
  danger: { box: "border-danger-line bg-danger-soft text-danger", icon: XCircle },
};

export function InlineAlert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = alertStyles[tone];
  return (
    <div className={cn("flex gap-3 rounded-[10px] border px-3.5 py-3 text-sm", box, className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-ink-2">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Capability not provisioned/configured on this deployment. Honest, actionable, never a fake success. */
export function NotConfiguredNotice({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-[10px] border border-dashed border-line-strong bg-canvas px-3.5 py-3 text-sm", className)}>
      <PlugZap className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        {children ? <div className="mt-0.5 text-muted">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-1 text-subtle">{icon}</div> : <EmptyIllustration />}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Neutral geometric illustration (no people, no fabricated content). */
function EmptyIllustration() {
  return (
    <svg width="56" height="44" viewBox="0 0 56 44" fill="none" aria-hidden="true" className="mb-1">
      <rect x="6" y="8" width="44" height="30" rx="6" fill="var(--color-selected)" />
      <rect x="12" y="14" width="18" height="3" rx="1.5" fill="var(--color-line-strong)" />
      <rect x="12" y="21" width="30" height="3" rx="1.5" fill="var(--color-line)" />
      <rect x="12" y="28" width="24" height="3" rx="1.5" fill="var(--color-line)" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-selected", className)} aria-hidden="true" />;
}

/** Renders a metric that may be unavailable (null) without turning it into zero. */
export function MetricValue({ value, format, unavailableLabel = "—" }: { value: number | null | undefined; format: (n: number) => string; unavailableLabel?: string }) {
  if (value === null || value === undefined) return <span className="text-muted" title="Not available">{unavailableLabel}</span>;
  return <>{format(value)}</>;
}
