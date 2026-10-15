"use client";

import { ChoiceCardGroup } from "@/components/ui/choice-card";
import { contentFormatLabels, contentFormats, type ContentFormat } from "@/domain/playbook-content";
import { FormatIllustration } from "./illustrations";
import { SectionFrame, type SectionProps } from "./section-frame";

/** Observed card descriptions (L21 / B04). */
const formatDescriptions: Record<ContentFormat, string> = {
  slideshow: "The fastest way to reach viewers, and the best way to test new formats.",
  ugc: "Creators show faces on camera to promote your brand.",
};

export function ContentSection({ active, state, update, errors }: Pick<SectionProps, "active" | "state" | "update" | "errors">) {
  return (
    <SectionFrame id="content" active={active} title="Content" description="Pick the kind of content creators make for you.">
      <div id="content-format">
        <ChoiceCardGroup
          name="format"
          legend="Content format"
          legendHidden
          columns={2}
          tone="ink"
          value={state.format}
          onChange={(value) => update({ format: value as ContentFormat })}
          options={contentFormats.map((format) => ({
            value: format,
            label: contentFormatLabels[format],
            description: formatDescriptions[format],
            media: <FormatIllustration format={format} />,
          }))}
        />
        {errors.format ? <p className="mt-2 text-[13px] text-danger">{errors.format}</p> : null}
      </div>
      <p className="text-[13px] text-muted">Playbooks you add to this campaign use the same format.</p>
    </SectionFrame>
  );
}
