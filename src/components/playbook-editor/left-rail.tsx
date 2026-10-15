"use client";

import type { ReactNode } from "react";
import { Bot, ChevronDown, ChevronUp, Film, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { formatScriptCount, type ScriptMath } from "@/domain/playbook-combinatorics";
import type { PlaybookContent } from "@/domain/playbook-content";
import { playbookLimits } from "@/domain/playbook-validation";
import { cn } from "@/lib/cn";

interface RailItem {
  id: string;
  title: string;
  summary: string;
}

function railItems(content: PlaybookContent): RailItem[] {
  if (content.kind === "ugc") {
    return content.scenes.map((s, i) => ({
      id: s.id,
      title: s.name.trim() || `Scene ${i + 1}`,
      summary: s.instructions.trim() || "No instructions yet",
    }));
  }
  return content.slides.map((s, i) => {
    const caption = s.captionOptions.find((c) => c.trim());
    return {
      id: s.id,
      title: `Slide ${i + 1}`,
      summary: caption ?? "No caption yet",
    };
  });
}

const railButton =
  "flex w-full items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left text-sm text-ink hover:bg-hover max-md:min-h-11";

export function LeftRail({
  content,
  math,
  onShowMath,
  onOpenTemplates,
  onOpenAgent,
  onJumpTo,
  onRemove,
  onMove,
  onAdd,
  issueKeys,
}: {
  content: PlaybookContent;
  math: ScriptMath;
  onShowMath: () => void;
  onOpenTemplates: () => void;
  onOpenAgent: () => void;
  onJumpTo: (domId: string, itemId?: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  onAdd: () => void;
  issueKeys: ReadonlySet<string>;
}) {
  const items = railItems(content);
  const isUgc = content.kind === "ugc";
  const noun = isUgc ? "scene" : "slide";
  const limit = isUgc ? playbookLimits.scenes : playbookLimits.slides;

  return (
    <nav aria-label="Playbook outline" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onShowMath}
        className="rounded-[12px] border border-line bg-surface px-4 py-3 text-left hover:bg-hover"
        aria-haspopup="dialog"
      >
        <span className="block text-[13px] text-muted">Unique scripts from this setup:</span>
        <span className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-ink" aria-label={`${formatScriptCount(math.total)} unique scripts`}>
            {formatScriptCount(math.total)}
          </span>
          <span className="text-[13px] font-medium text-ink-2 underline underline-offset-2">See the math</span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onOpenTemplates} className={railButton} aria-haspopup="dialog">
          <LayoutTemplate className="size-4 text-muted" aria-hidden="true" />
          Templates
        </button>
        <button type="button" onClick={onOpenAgent} className={railButton} aria-haspopup="dialog">
          <Bot className="size-4 text-muted" aria-hidden="true" />
          Agent
        </button>
      </div>

      {content.kind === "ugc" ? (
        <button type="button" onClick={() => onJumpTo("references")} className={railButton}>
          <Film className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-medium">References</span>
            <span className="block text-[12px] text-muted">
              {content.references.length} example {content.references.length === 1 ? "video" : "videos"} ·{" "}
              {content.generalInstructions.trim() ? "general instructions added" : "no general instructions"}
            </span>
          </span>
        </button>
      ) : null}

      {items.length > 0 ? (
        <ol className="flex flex-col gap-2" aria-label={isUgc ? "Scenes" : "Slides"}>
          {items.map((item, index) => {
            const flagged = issueKeys.has(`${noun}:${item.id}`);
            return (
              <li key={item.id} className="flex gap-2">
                <span className="mt-2.5 w-5 shrink-0 text-right text-[13px] font-medium tabular-nums text-muted" aria-hidden="true">
                  {index + 1}
                </span>
                <div className={cn("group min-w-0 flex-1 rounded-[10px] border bg-surface", flagged ? "border-warning-line" : "border-line")}>
                  <button
                    type="button"
                    onClick={() => onJumpTo(`item-${item.id}`, item.id)}
                    className="block w-full rounded-t-[10px] px-3 pb-1 pt-2 text-left hover:bg-hover"
                    aria-label={`${index + 1}. ${item.title}: go to ${noun}`}
                  >
                    <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                    <span className="line-clamp-2 text-[12px] text-muted">{item.summary}</span>
                  </button>
                  <div className="flex items-center justify-end gap-0.5 px-1.5 pb-1">
                    <IconButton label={`Move ${item.title} up`} disabled={index === 0} onClick={() => onMove(item.id, -1)}>
                      <ChevronUp className="size-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton label={`Move ${item.title} down`} disabled={index === items.length - 1} onClick={() => onMove(item.id, 1)}>
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton label={`Delete ${noun} ${item.title}`} onClick={() => onRemove(item.id)} danger>
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      <button
        type="button"
        onClick={onAdd}
        disabled={items.length >= limit}
        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-strong px-3 text-sm font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50 max-md:min-h-11"
      >
        <Plus className="size-4" aria-hidden="true" />
        New {noun}
      </button>
      {items.length >= limit ? (
        <p className="text-[12px] text-muted">
          Up to {limit} {noun}s per playbook.
        </p>
      ) : null}
    </nav>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-hover disabled:opacity-30 max-md:size-11",
        danger ? "hover:text-danger" : "hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
