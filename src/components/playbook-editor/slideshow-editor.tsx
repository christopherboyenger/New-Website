"use client";

import { ExternalLink, ImageIcon, Trash2 } from "lucide-react";
import { NotConfiguredNotice } from "@/components/ui/feedback";
import type { SlideshowContent } from "@/domain/playbook-content";
import { playbookLimits } from "@/domain/playbook-validation";
import { GeneralInstructions } from "./general-instructions";
import { LinkAdder } from "./link-adder";
import { hostOf, itemDomId, type DraftAction } from "./model";
import { OptionList } from "./option-list";

/**
 * Slideshow format (documented slideshow guide): ordered slides, each with
 * image options and caption options; one of each is chosen per post.
 * Kept separate from the UGC editor so format rules never mix.
 */
export function SlideshowEditor({
  content,
  dispatch,
  mediaStorage,
  onRemoveSlide,
  issueKeys,
}: {
  content: SlideshowContent;
  dispatch: (action: DraftAction) => void;
  mediaStorage: { configured: boolean; detail: string };
  onRemoveSlide: (id: string) => void;
  issueKeys: ReadonlySet<string>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <GeneralInstructions value={content.generalInstructions} onChange={(value) => dispatch({ type: "general", value })} />

      {!mediaStorage.configured ? (
        <NotConfiguredNotice title="Image uploads aren't available on this deployment">
          {mediaStorage.detail} Add image options as links to public images instead.
        </NotConfiguredNotice>
      ) : null}

      {content.slides.length === 0 ? (
        <section className="rounded-[12px] border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
          <h2 className="text-[15px] font-semibold text-ink">No slides yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Slides appear in order. Add one with New slide, or start from a template.</p>
        </section>
      ) : null}

      {content.slides.map((slide, index) => {
        const flagged = issueKeys.has(`slide:${slide.id}`);
        const n = index + 1;
        return (
          <section
            key={slide.id}
            id={itemDomId(slide.id)}
            aria-labelledby={`slide-title-${slide.id}`}
            className={`scroll-mt-28 rounded-[12px] border bg-surface p-4 sm:p-5 ${flagged ? "border-warning-line" : "border-line"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id={`slide-title-${slide.id}`} className="text-base font-semibold text-ink">
                Slide {n} <span className="font-normal text-muted">of {content.slides.length}</span>
              </h2>
              <button
                type="button"
                onClick={() => onRemoveSlide(slide.id)}
                className="inline-flex min-h-8 items-center gap-1 rounded-[8px] px-2 text-[13px] text-muted hover:bg-hover hover:text-danger max-md:min-h-11"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Remove slide
              </button>
            </div>

            <div className="mt-4">
              <p className="text-[13px] font-medium text-ink">
                {slide.imageOptions.length} Image options <span className="font-normal text-muted">one is picked per post</span>
              </p>
              {slide.imageOptions.length > 0 ? (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {slide.imageOptions.map((image, i) => (
                    <li key={image.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-canvas px-3 py-2">
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-selected text-ink-2" aria-hidden="true">
                        <ImageIcon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{image.title || `Image option ${i + 1}`}</p>
                        {image.url ? (
                          <a
                            href={image.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex max-w-full items-center gap-1 text-[13px] text-muted underline-offset-2 hover:underline"
                          >
                            <span className="truncate">{hostOf(image.url)}</span>
                            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: "removeSlideImage",
                            id: slide.id,
                            imageId: image.id,
                          })
                        }
                        aria-label={`Remove slide ${n} image option ${i + 1}`}
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-ink max-md:size-11"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[13px] text-muted">No image options yet. Creators use their own image for this slide.</p>
              )}
              <div className="mt-3">
                <LinkAdder
                  urlLabel={`Slide ${n} image link`}
                  addLabel="Add image"
                  addAccessibleLabel={`Add image to slide ${n}`}
                  disabled={slide.imageOptions.length >= playbookLimits.optionsPerItem}
                  disabledReason={`Up to ${playbookLimits.optionsPerItem} image options per slide.`}
                  onAdd={(link) =>
                    dispatch({
                      type: "addSlideImage",
                      id: slide.id,
                      image: {
                        assetId: null,
                        url: link.url,
                        title: link.title,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <OptionList
                heading={`${slide.captionOptions.length} Caption options`}
                hint="one is picked per post"
                itemLabel={`Slide ${n} caption`}
                addLabel="Add caption"
                addAccessibleLabel={`Add caption to slide ${n}`}
                placeholder="Caption on the slide…"
                emptyText="Add at least one caption before publishing."
                maxLength={playbookLimits.caption}
                values={slide.captionOptions}
                onChange={(captionOptions) =>
                  dispatch({
                    type: "setSlideCaptions",
                    id: slide.id,
                    captionOptions,
                  })
                }
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
