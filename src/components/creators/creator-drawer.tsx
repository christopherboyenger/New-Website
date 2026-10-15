"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ExternalLink, X } from "lucide-react";
import { platformLabels } from "@/domain/campaign";
import type { CreatorDetail } from "@/server/creators-roster";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/feedback";
import { FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { CreatorAvatar } from "./creator-avatar";
import { formatMetric, formatUtcDate, levelLabel } from "./format";
import type { RosterCommand } from "./roster-table";

const verificationLabels: Record<CreatorDetail["accounts"][number]["verification"], { label: string; tone: Tone }> = {
  verified: { label: "Verified", tone: "success" },
  pending: { label: "Verification pending", tone: "warning" },
  unverified: { label: "Not verified", tone: "neutral" },
  failed: { label: "Verification failed", tone: "danger" },
};

const reviewLabels: Record<CreatorDetail["recentPosts"][number]["reviewStatus"], { label: string; tone: Tone }> = {
  submitted: { label: "In review", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Creator detail as a side sheet on a native modal <dialog> (focus contained,
 * Escape closes, focus returns to the row link). The open creator lives in the
 * URL (`?creator=`), so the sheet is deep-linkable and Back closes it.
 */
export function CreatorDrawer({
  detail,
  closeHref,
  canManage,
  removeAction,
  restoreAction,
}: {
  detail: CreatorDetail;
  closeHref: string;
  canManage: boolean;
  removeAction: RosterCommand;
  restoreAction: RosterCommand;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
  }, []);

  function close() {
    ref.current?.close();
    router.replace(closeHref, { scroll: false });
    returnFocus.current?.focus();
  }

  function toggleRoster() {
    setError(null);
    startTransition(async () => {
      const result = await (detail.removed ? restoreAction : removeAction)({ creatorIds: [detail.id] });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify(result.message ?? "Saved.", "success");
      setConfirming(false);
    });
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-md border-l border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/20 sm:w-[28rem]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <CreatorAvatar name={detail.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold">
              {detail.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
              <Badge>{levelLabel(detail.level)}</Badge>
              {detail.removed ? <Badge tone="warning">Removed</Badge> : null}
              {detail.country ? <span>{detail.country}</span> : null}
              <span>· On your roster since {formatUtcDate(detail.firstSeenAt)}</span>
            </div>
          </div>
          <button type="button" onClick={close} className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink max-md:p-2.5" aria-label="Close creator details">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section aria-labelledby={`${titleId}-accounts`}>
            <h3 id={`${titleId}-accounts`} className="mb-2 text-sm font-semibold">
              Social accounts
            </h3>
            {detail.accounts.length === 0 ? (
              <p className="text-sm text-muted">No social accounts connected yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-[10px] border border-line">
                {detail.accounts.map((account) => {
                  const status = verificationLabels[account.verification];
                  return (
                    <li key={account.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">@{account.handle}</span>
                        <span className="text-xs text-muted">{platformLabels[account.platform]}</span>
                      </span>
                      <Badge tone={status.tone}>
                        {account.verification === "verified" ? <BadgeCheck className="size-3" aria-hidden="true" /> : null}
                        {status.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby={`${titleId}-campaigns`}>
            <h3 id={`${titleId}-campaigns`} className="mb-2 text-sm font-semibold">
              Campaigns
            </h3>
            {detail.campaigns.length === 0 ? (
              <p className="text-sm text-muted">Not admitted to any of your campaigns.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {detail.campaigns.map((c) => (
                  <li key={c.id}>
                    <Badge>{c.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby={`${titleId}-posts`}>
            <h3 id={`${titleId}-posts`} className="mb-2 text-sm font-semibold">
              Recent posts
            </h3>
            {detail.recentPosts.length === 0 ? (
              <p className="text-sm text-muted">No posts submitted to your campaigns yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-[10px] border border-line">
                {detail.recentPosts.map((post) => {
                  const review = reviewLabels[post.reviewStatus];
                  const href = safeHttpUrl(post.url);
                  return (
                    <li key={post.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 font-medium hover:underline">
                            <span className="truncate">
                              {platformLabels[post.platform]} · @{post.handle}
                            </span>
                            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        ) : (
                          <span className="block truncate font-medium">
                            {platformLabels[post.platform]} · @{post.handle}
                          </span>
                        )}
                        <span className="block text-xs text-muted">
                          {post.postedAt ? `Posted ${formatUtcDate(post.postedAt)}` : `Submitted ${formatUtcDate(post.submittedAt)}`} · {formatMetric(post.views)} views
                        </span>
                      </span>
                      <Badge tone={review.tone}>{review.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {canManage ? (
          <div className="space-y-2 border-t border-line px-5 py-3">
            <FormError message={error} />
            {confirming ? (
              <div className="space-y-2">
                <p className="text-sm text-ink-2">
                  {detail.removed
                    ? "Restore this creator? They can be admitted to your campaigns again."
                    : "Remove this creator? They can't be admitted to your campaigns again until restored. Their posts and metrics stay."}
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
                    Cancel
                  </Button>
                  <Button variant={detail.removed ? "primary" : "danger"} onClick={toggleRoster} loading={pending}>
                    {detail.removed ? "Restore" : "Remove"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setConfirming(true)}>
                  {detail.removed ? "Restore to roster" : "Remove from roster"}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
