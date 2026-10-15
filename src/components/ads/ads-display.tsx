/**
 * Shared, server-renderable pieces of the Ads area: provider names, stage
 * badges, the ad-account prerequisite (L08/L38) and date formatting.
 */
import { Megaphone } from "lucide-react";
import type { ReactNode } from "react";
import type { IntegrationStatus } from "@/server/db/schema";
import type { AdProvider } from "@/domain/tracking-params";
import { ButtonLink } from "@/components/ui/button";
import { Badge, InlineAlert, type Tone } from "@/components/ui/feedback";

export const providerLabels: Record<AdProvider, string> = { meta_ads: "Meta", tiktok_ads: "TikTok" };

export type AdStage =
  | "draft"
  | "validating"
  | "creating_paused"
  | "awaiting_confirmation"
  | "activating"
  | "active"
  | "rejected"
  | "paused"
  | "failed"
  | "reconciliation_required";

const stageDisplay: Record<AdStage, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  validating: { label: "Validating", tone: "info" },
  creating_paused: { label: "Creating (paused)", tone: "info" },
  awaiting_confirmation: { label: "Awaiting confirmation", tone: "warning" },
  activating: { label: "Activating", tone: "info" },
  active: { label: "Active", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  paused: { label: "Paused", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  reconciliation_required: { label: "Needs reconciliation", tone: "warning" },
};

export function StageBadge({ stage }: { stage: AdStage }) {
  const s = stageDisplay[stage];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const utcDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Oct 14, 2026" for an ISO instant, as its UTC day. */
export function formatUtcDate(iso: string): string {
  return utcDate.format(new Date(iso));
}

/** What the ads UI needs to know about one Meta/TikTok installation. */
export interface ConnectionSummary {
  provider: AdProvider;
  status: IntegrationStatus;
  /** Launch scopes not granted; a `connected` installation with any missing can't create ads. */
  missingLaunchScopes?: readonly string[];
}

const statusText: Partial<Record<IntegrationStatus, string>> = {
  reauthorization_required: "needs to be reauthorized",
  error: "reported an error",
  revocation_pending: "is being disconnected",
  limited_permissions: "is missing permissions needed to create ads",
  verifying: "is still being verified",
  awaiting_customer_grant: "is waiting for authorization",
  pending_app_review: "is waiting for provider app review",
};

/**
 * The connection prerequisite: no verified Meta/TikTok ad account. Installations
 * in another state are named with what's wrong instead of a generic prompt.
 */
export function AdAccountPrerequisite({
  message,
  integrationsHref,
  installations,
  headingLevel = 2,
}: {
  message: ReactNode;
  integrationsHref: string;
  installations: ConnectionSummary[];
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby="ad-account-prerequisite" className="rounded-[12px] border border-line bg-surface px-6 py-10 text-center">
      <span className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-full bg-selected text-ink-2">
        <Megaphone className="size-5" aria-hidden="true" />
      </span>
      <Heading id="ad-account-prerequisite" className="mx-auto max-w-md text-[15px] font-medium text-ink">
        {message}
      </Heading>
      <ConnectionProblems installations={installations} className="mx-auto mt-4 max-w-md text-left" />
      <ButtonLink href={integrationsHref} variant="secondary" className="mt-5 max-md:min-h-11">
        Go to Integrations
      </ButtonLink>
    </section>
  );
}

/** Warnings for Meta/TikTok installations that exist but can't be used right now. */
export function ConnectionProblems({ installations, className }: { installations: ConnectionSummary[]; className?: string }) {
  const problems = installations.flatMap((i) => {
    const text = statusText[i.status] ?? (i.status === "connected" && i.missingLaunchScopes?.length ? "can read reports but wasn't granted permission to create ads — reconnect it and allow ad management" : null);
    return text ? [{ provider: i.provider, text }] : [];
  });
  if (!problems.length) return null;
  return (
    <div className={className}>
      {problems.map((p) => (
        <InlineAlert key={p.provider} tone="warning" className="mt-2 first:mt-0">
          Your {providerLabels[p.provider]} connection {p.text}.
        </InlineAlert>
      ))}
    </div>
  );
}
