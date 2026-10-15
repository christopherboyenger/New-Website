"use client";

import { useMemo, useState } from "react";
import { ImageIcon, Play, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sampleVariation, type SampleVariation } from "@/domain/playbook-combinatorics";
import type { PlaybookContent } from "@/domain/playbook-content";
import { hostOf } from "./model";

/**
 * Phone-frame preview of what a creator sees for one sample variation.
 * Deterministic per seed; Shuffle advances the seed. Neutral placeholders
 * only — no creator faces, no media fetched from links.
 */
export function CreatorPreview({
  brandName,
  content,
  descriptions,
  hashtags,
  primaryHashtag,
  total,
}: {
  brandName: string;
  content: PlaybookContent;
  descriptions: string[];
  hashtags: string[];
  primaryHashtag: string;
  total: number;
}) {
  const [seed, setSeed] = useState(0);
  const sample = useMemo(
    () => sampleVariation({ content, descriptions, hashtags, primaryHashtag }, seed),
    [content, descriptions, hashtags, primaryHashtag, seed],
  );
  const initial = brandName.trim().charAt(0).toUpperCase() || "?";

  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="preview-title" className="text-[15px] font-semibold text-ink">
            Preview what the creator sees
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">One sample variation of your playbook in the creator app.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSeed((s) => s + 1)}
          disabled={total <= 1}
          className="shrink-0 max-md:min-h-11"
          aria-describedby="preview-variation"
        >
          <Shuffle className="size-3.5" aria-hidden="true" />
          Shuffle
        </Button>
      </div>
      <p id="preview-variation" className="sr-only" aria-live="polite">
        {total <= 1 ? "Only one variation exists." : `Showing sample ${seed + 1}.`}
      </p>

      <figure aria-label="What the creator sees in the app" className="mx-auto w-full max-w-[300px]">
        <div className="rounded-[36px] border-[7px] border-ink bg-ink shadow-lg">
          <div className="flex h-[560px] flex-col overflow-hidden rounded-[29px] bg-surface">
            <div className="flex items-center gap-2 border-b border-line px-4 pb-2.5 pt-5">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-selected text-[12px] font-semibold text-ink-2">{initial}</span>
              <span className="truncate text-[13px] font-semibold text-ink">{brandName}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {sample.kind === "ugc" ? (
                <UgcScreens sample={sample} references={content.kind === "ugc" ? content.references.length : 0} />
              ) : (
                <SlideScreens sample={sample} />
              )}
              <div className="mt-4 rounded-[12px] bg-canvas p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Post description</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ink">
                  {sample.description ?? <span className="text-subtle">No description yet</span>}
                </p>
                <p className="mt-1.5 break-words text-[13px] font-medium text-info">{sample.hashtags.map((t) => `#${t}`).join(" ")}</p>
              </div>
            </div>
            <div className="border-t border-line px-4 py-3">
              <div className="flex h-9 items-center justify-center rounded-full bg-ink text-[13px] font-medium text-white" aria-hidden="true">
                Next
              </div>
            </div>
          </div>
        </div>
      </figure>
    </section>
  );
}

function UgcScreens({ sample, references }: { sample: Extract<SampleVariation, { kind: "ugc" }>; references: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex aspect-[9/10] flex-col items-center justify-center gap-2 rounded-[14px] bg-selected text-center">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-surface text-ink-2">
          <Play className="size-4" />
        </span>
        <span className="text-[13px] font-medium text-ink-2">Watch the inspiration post</span>
        <span className="text-[11px] text-muted">
          {references === 0 ? "No reference videos yet" : `${references} reference ${references === 1 ? "video" : "videos"}`}
        </span>
      </div>
      {sample.scenes.length === 0 ? <p className="text-center text-[12px] text-subtle">Scenes you add appear here.</p> : null}
      {sample.scenes.map((scene, i) => (
        <div key={scene.id} className="rounded-[12px] border border-line p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Scene {i + 1} of {sample.scenes.length}
          </p>
          <p className="mt-0.5 text-[13px] font-semibold text-ink">{scene.name.trim() || `Scene ${i + 1}`}</p>
          <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[12px] text-ink-2">{scene.instructions.trim() || "No instructions yet"}</p>
          {scene.onScreenText ? (
            <p className="mt-2 rounded-[8px] bg-ink px-2.5 py-1.5 text-center text-[12px] font-semibold text-white">{scene.onScreenText}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SlideScreens({ sample }: { sample: Extract<SampleVariation, { kind: "slideshow" }> }) {
  if (sample.slides.length === 0) return <p className="py-10 text-center text-[12px] text-subtle">Slides you add appear here.</p>;
  return (
    <ol className="flex snap-x gap-2 overflow-x-auto pb-1">
      {sample.slides.map((slide, i) => (
        <li
          key={slide.id}
          className="relative flex aspect-[3/4] w-[78%] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[12px] bg-selected p-2.5"
        >
          <span className="self-start rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-medium text-ink-2">
            {i + 1}/{sample.slides.length}
          </span>
          <span className="flex flex-col items-center gap-1 text-center text-[11px] text-muted">
            <ImageIcon className="size-5" />
            {slide.image ? (
              <>
                Image option {slide.imageCount > 1 ? `(1 of ${slide.imageCount})` : ""}
                <span className="max-w-full truncate">{slide.image.title || hostOf(slide.image.url)}</span>
              </>
            ) : (
              "Creator's own image"
            )}
          </span>
          <span className="rounded-[8px] bg-ink/85 px-2 py-1.5 text-center text-[12px] font-semibold text-white">
            {slide.caption ?? <span className="font-normal text-white/70">No caption yet</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
