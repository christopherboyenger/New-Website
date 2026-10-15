import { ExternalLink } from "lucide-react";
import { campaignStatusLabels, platformLabels } from "@/domain/campaign";
import { formatAge, formatUtcInstant } from "@/components/workspace/format";
import { Badge, type Tone } from "@/components/ui/feedback";
import { summarizeChecks } from "@/server/ops/review-checks";
import type { ReviewQueueItem } from "@/server/ops/review";
import { CheckList } from "./check-list";
import { ReviewDecisionForm, type ReasonOption } from "./review-decision-form";

const verificationTone: Record<string, Tone> = { verified: "success", pending: "warning", unverified: "neutral", failed: "danger" };
const campaignTone: Record<string, Tone> = { active: "success", paused: "warning", inactive: "neutral" };

/** Only http(s) URLs become links; anything else is shown as text. */
function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function ReviewCard({ item, reasons, noteMax, now }: { item: ReviewQueueItem; reasons: ReasonOption[]; noteMax: number; now: Date }) {
  const headingId = `review-${item.postId}`;
  const summary = summarizeChecks(item.checks);
  const href = safeHttpUrl(item.url);

  return (
    <article aria-labelledby={headingId} className="rounded-[12px] border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[15px] font-semibold text-ink">
            {item.org.name}
            <span className="font-normal text-muted"> · {item.campaign ? item.campaign.name : "No campaign"}</span>
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {item.campaign ? (
              <>
                <Badge tone="neutral">#{item.campaign.primaryHashtag}</Badge>
                <Badge tone={campaignTone[item.campaign.status]}>Campaign {campaignStatusLabels[item.campaign.status].toLowerCase()}</Badge>
              </>
            ) : (
              <Badge tone="warning">Unattributed</Badge>
            )}
            <span className="text-xs text-subtle">{item.org.slug}</span>
          </div>
        </div>
        <p className="text-[13px] text-muted">
          Submitted <time dateTime={item.submittedAt.toISOString()}>{formatUtcInstant(item.submittedAt)}</time> ({formatAge(item.submittedAt, now)})
        </p>
      </header>

      <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-muted">Creator</dt>
            <dd className="text-ink">{item.creator.displayName}</dd>

            <dt className="text-muted">Account</dt>
            <dd className="flex flex-wrap items-center gap-1.5 text-ink">
              <span>
                {platformLabels[item.platform]} · @{item.account?.handle ?? item.handle}
              </span>
              {item.account ? (
                <Badge tone={verificationTone[item.account.verification]}>{item.account.verification === "verified" ? "Verified" : `Verification ${item.account.verification}`}</Badge>
              ) : (
                <Badge tone="danger">No linked account</Badge>
              )}
            </dd>

            <dt className="text-muted">Post URL</dt>
            <dd className="min-w-0">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 text-ink underline underline-offset-4 hover:text-ink-2">
                  <span className="truncate">{item.url}</span>
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <span className="break-all text-ink">{item.url}</span>
              )}
            </dd>

            <dt className="text-muted">Playbook</dt>
            <dd className="text-ink">
              {item.playbook ? (
                <>
                  {item.playbook.name}
                  <span className="text-muted"> · {item.playbook.revision !== null ? `revision ${item.playbook.revision}` : "revision not recorded"}</span>
                </>
              ) : (
                <span className="text-muted">Custom post (no playbook)</span>
              )}
            </dd>

            <dt className="text-muted">Caption</dt>
            <dd className="min-w-0">
              {item.caption ? (
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-[8px] bg-canvas px-3 py-2 text-ink">{item.caption}</p>
              ) : (
                <span className="text-muted">No caption recorded</span>
              )}
            </dd>
          </dl>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Automatic checks">
            <h3 className="mb-2 flex items-center justify-between text-[13px] font-medium text-ink-2">
              Automatic checks
              <span className="font-normal text-muted">
                {summary.failed ? `${summary.failed} failed` : summary.warned ? `${summary.warned} warning` : "All passed"}
              </span>
            </h3>
            <CheckList checks={item.checks} />
            <p className="mt-2 text-xs text-muted">Checks inform the decision; they never approve or reject on their own.</p>
          </section>
          <ReviewDecisionForm postId={item.postId} reasons={reasons} noteMax={noteMax} />
        </div>
      </div>
    </article>
  );
}
