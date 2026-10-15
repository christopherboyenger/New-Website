import { ExternalLink, ImageOff } from "lucide-react";
import type { CreatorVariation } from "@/domain/creator-variation";
import type { ReferenceItem } from "@/domain/playbook-content";
import { Card, CardBody, CardHeader } from "@/components/ui/layout";
import { CopyButton } from "./copy-button";

/** Only http(s) references render as links (brand-entered URLs are untrusted). */
function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function Reference({ item }: { item: ReferenceItem }) {
  const href = safeHref(item.url);
  const title = item.title.trim() || "Reference";
  if (!href) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        <ImageOff className="size-3.5" aria-hidden="true" />
        {title} (file not available — media storage isn&apos;t set up)
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink underline underline-offset-4 md:min-h-0">
      {title}
      <ExternalLink className="size-3.5" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </div>
  );
}

/**
 * The creator's own version of a published playbook revision: scenes with
 * one chosen on-screen text each (UGC) or slides with one chosen image and
 * caption (Slideshow), plus one description and the hashtags to post with.
 */
export function PlaybookScript({ variation }: { variation: CreatorVariation }) {
  const { script } = variation;
  const hashtagLine = variation.hashtags.join(" ");
  const postText = [variation.description, hashtagLine].filter(Boolean).join("\n\n");
  return (
    <div className="flex flex-col gap-4">
      {script.generalInstructions.trim() ? (
        <Card>
          <CardHeader title="Instructions" />
          <CardBody>
            <Paragraphs text={script.generalInstructions} />
          </CardBody>
        </Card>
      ) : null}

      {script.kind === "ugc" && script.references.length > 0 ? (
        <Card>
          <CardHeader title="Reference videos" description="Examples from the brand of the style they're after." />
          <CardBody>
            <ul className="flex flex-col gap-1">
              {script.references.map((r) => (
                <li key={r.id}>
                  <Reference item={r} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={script.kind === "ugc" ? "Your script" : "Your slides"}
          description={script.kind === "ugc" ? "Film these scenes in order. On-screen text was picked for you; it stays the same each time you open this playbook." : "Post these slides in order. Images and captions were picked for you."}
        />
        <CardBody>
          {script.kind === "ugc" ? (
            script.scenes.length === 0 ? (
              <p className="text-sm text-muted">This playbook has no scenes. Follow the instructions above.</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {script.scenes.map((scene, i) => (
                  <li key={scene.id} className="rounded-[10px] border border-line p-4">
                    <p className="text-xs font-medium text-muted">Scene {i + 1}</p>
                    <h3 className="mt-0.5 text-sm font-semibold text-ink">{scene.name.trim() || `Scene ${i + 1}`}</h3>
                    {scene.instructions.trim() ? (
                      <div className="mt-2">
                        <Paragraphs text={scene.instructions} />
                      </div>
                    ) : null}
                    {scene.onScreenText ? (
                      <div className="mt-3 rounded-[8px] bg-canvas px-3 py-2">
                        <p className="text-xs text-muted">On-screen text</p>
                        <p className="mt-0.5 whitespace-pre-line text-sm font-medium text-ink">{scene.onScreenText}</p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )
          ) : script.slides.length === 0 ? (
            <p className="text-sm text-muted">This playbook has no slides. Follow the instructions above.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {script.slides.map((slide, i) => (
                <li key={slide.id} className="rounded-[10px] border border-line p-4">
                  <p className="text-xs font-medium text-muted">Slide {i + 1}</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {slide.image ? <Reference item={slide.image} /> : <p className="text-sm text-muted">No image for this slide.</p>}
                    {slide.caption ? (
                      <div className="rounded-[8px] bg-canvas px-3 py-2">
                        <p className="text-xs text-muted">Caption</p>
                        <p className="mt-0.5 whitespace-pre-line text-sm font-medium text-ink">{slide.caption}</p>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Post text" description="Use this description and every hashtag when you post." actions={<CopyButton text={postText} label="Copy description and hashtags" />} />
        <CardBody>
          {variation.description ? <p className="whitespace-pre-line text-sm text-ink">{variation.description}</p> : <p className="text-sm text-muted">No description for this playbook — write your own.</p>}
          <p className="mt-3 flex flex-wrap gap-1.5">
            {variation.hashtags.map((tag) => (
              <span key={tag} className="rounded-full bg-selected px-2 py-0.5 text-xs font-medium text-ink-2">
                {tag}
              </span>
            ))}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
