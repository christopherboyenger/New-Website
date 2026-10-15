"use client";

import { Bot, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { NotConfiguredNotice } from "@/components/ui/feedback";
import { contentFormatLabels, type ContentFormat } from "@/domain/playbook-content";
import { templatesForFormat, type PlaybookTemplate } from "@/domain/playbook-templates";

/** Format-compatible starter templates (DEC-009: never another format's). */
export function TemplatesDialog({
  open,
  onClose,
  format,
  currentTemplateId,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  format: ContentFormat;
  currentTemplateId: string | null;
  onChoose: (template: PlaybookTemplate) => void;
}) {
  const templates = templatesForFormat(format);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Templates"
      description={`Starting points for ${contentFormatLabels[format]} playbooks. Using one replaces the current scenes and descriptions.`}
      size="lg"
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const parts = t.content.kind === "ugc" ? t.content.scenes.length : t.content.slides.length;
          const unit = t.content.kind === "ugc" ? "scene" : "slide";
          return (
            <li key={t.id} className="flex flex-col gap-2 rounded-[12px] border border-line p-4">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="size-4 text-muted" aria-hidden="true" />
                <h3 className="text-[15px] font-semibold text-ink">{t.name}</h3>
                {t.id === currentTemplateId ? <span className="text-[12px] text-muted">(current)</span> : null}
              </div>
              <p className="flex-1 text-sm text-muted">{t.summary}</p>
              <p className="text-[13px] text-ink-2">
                {parts} {parts === 1 ? unit : `${unit}s`} · {t.descriptions.length} {t.descriptions.length === 1 ? "description" : "descriptions"}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onChoose(t)}
                className="self-start max-md:min-h-11"
                aria-label={`Use the ${t.name} template`}
              >
                Use template
              </Button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** Agent pane: AI authoring needs provisioned model access; say so honestly. */
export function AgentDialog({
  open,
  onClose,
  detail,
  onBrowseTemplates,
}: {
  open: boolean;
  onClose: () => void;
  detail: string;
  onBrowseTemplates: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Agent"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="max-md:min-h-11">
            Close
          </Button>
          <Button onClick={onBrowseTemplates} className="max-md:min-h-11">
            Browse templates
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <Bot className="size-4" aria-hidden="true" />
          Drafting scenes with an AI agent
        </div>
        <NotConfiguredNotice title="AI authoring isn't available on this deployment">
          {detail} Write scenes yourself or start from a template.
        </NotConfiguredNotice>
      </div>
    </Dialog>
  );
}
