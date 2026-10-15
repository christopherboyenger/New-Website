"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Hash, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { playbookLimits } from "@/domain/playbook-validation";
import { cn } from "@/lib/cn";
import { saveStatusLabels, type SaveStatus } from "./model";

export interface PublicationState {
  status: "draft" | "published";
  publishedRevision: number | null;
  hasUnpublishedChanges: boolean;
  /** Distribution switch of the published playbook. */
  active: boolean;
}

export function EditorHeader({
  backHref,
  onBack,
  name,
  onRename,
  publication,
  saveStatus,
  onSave,
  onOpenHashtags,
  canPublish,
  onPublish,
  notice,
}: {
  backHref: string;
  onBack: (event: { preventDefault: () => void }) => void;
  name: string;
  onRename: (name: string) => void;
  publication: PublicationState;
  saveStatus: SaveStatus;
  onSave: () => void;
  onOpenHashtags: () => void;
  canPublish: boolean;
  onPublish: () => void;
  /** Save problems (conflict/error) stay visible under the sticky bar. */
  notice?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 md:flex-nowrap md:px-6">
        <Link
          href={backHref}
          onNavigate={onBack}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] px-2 text-sm font-medium text-ink-2 hover:bg-hover hover:text-ink max-md:min-h-11"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Playbooks
        </Link>
        <span className="hidden h-5 w-px bg-line md:block" aria-hidden="true" />

        <div className="order-last flex min-w-0 basis-full flex-wrap items-center gap-2 md:flex-nowrap md:order-none md:basis-auto md:flex-1">
          <label htmlFor="playbook-name" className="sr-only">
            Playbook name
          </label>
          <input
            id="playbook-name"
            value={name}
            placeholder="Untitled playbook"
            maxLength={playbookLimits.name}
            onChange={(e) => onRename(e.target.value)}
            className="h-9 min-w-[14rem] flex-1 rounded-[8px] md:min-w-0 border border-transparent bg-transparent px-2 text-[15px] font-semibold text-ink placeholder:text-subtle hover:border-line focus:border-ink-2 focus:outline-none max-md:h-11 md:max-w-md"
          />
          <PublicationBadge publication={publication} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <SaveIndicator status={saveStatus} />
          <Button
            variant="secondary"
            onClick={onSave}
            disabled={saveStatus === "saving" || saveStatus === "saved" || saveStatus === "conflict"}
            className="max-md:min-h-11"
            aria-keyshortcuts="Control+S Meta+S"
          >
            Save
          </Button>
          <Button variant="secondary" onClick={onOpenHashtags} aria-haspopup="dialog" className="max-md:min-h-11">
            <Hash className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Hashtags &amp; Descriptions</span>
          </Button>
          {canPublish ? (
            <Button onClick={onPublish} aria-haspopup="dialog" className="max-md:min-h-11">
              Publish
            </Button>
          ) : (
            <span className="hidden max-w-36 text-[12px] leading-tight text-muted lg:inline">Only workspace owners can publish.</span>
          )}
        </div>
      </div>
      {notice ? <div className="mx-auto max-w-[1440px] px-4 pb-2.5 md:px-6">{notice}</div> : null}
    </header>
  );
}

function PublicationBadge({ publication }: { publication: PublicationState }) {
  if (publication.status === "draft") {
    return (
      <span role="status" className="shrink-0">
        <Badge>Draft</Badge>
      </span>
    );
  }
  return (
    <span role="status" className="flex shrink-0 items-center gap-1.5">
      <Badge tone="success">Published · rev {publication.publishedRevision}</Badge>
      {!publication.active ? <Badge className="max-sm:hidden">Not available to creators</Badge> : null}
      {publication.hasUnpublishedChanges ? <Badge tone="warning">Unpublished changes</Badge> : null}
    </span>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const Icon = status === "saving" ? Loader2 : status === "saved" ? Check : status === "dirty" ? null : AlertTriangle;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[13px]",
        status === "conflict" || status === "error" ? "text-danger" : status === "dirty" ? "text-warning" : "text-muted",
      )}
    >
      {Icon ? (
        <Icon className={cn("size-3.5", status === "saving" && "animate-spin")} aria-hidden="true" />
      ) : (
        <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
      )}
      <span className={status === "saved" ? "max-sm:sr-only" : undefined}>{saveStatusLabels[status]}</span>
    </span>
  );
}
