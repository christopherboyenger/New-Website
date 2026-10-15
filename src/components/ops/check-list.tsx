import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ObjectiveCheck } from "@/server/ops/review-checks";

const icons = {
  pass: { Icon: CheckCircle2, cls: "text-success", sr: "Passed" },
  fail: { Icon: XCircle, cls: "text-danger", sr: "Failed" },
  warn: { Icon: AlertTriangle, cls: "text-warning", sr: "Warning" },
} as const;

/** Automatic objective checks. Informational: the operator makes the decision. */
export function CheckList({ checks }: { checks: ObjectiveCheck[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((check) => {
        const { Icon, cls, sr } = icons[check.status];
        return (
          <li key={check.key} className="flex gap-2 text-sm">
            <Icon className={cn("mt-0.5 size-4 shrink-0", cls)} aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium text-ink">
                <span className="sr-only">{sr}: </span>
                {check.label}
              </p>
              <p className="text-[13px] text-muted">{check.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
