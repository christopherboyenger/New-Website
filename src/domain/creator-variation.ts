/**
 * Creator-specific playbook variation (production-requirements.md §2
 * "creator-specific generated content"; build spec L05–L07 "one description is
 * picked per creator; hashtags are appended").
 *
 * Every pick is a pure function of (creatorId, playbookId, revision, slot), so
 * the same creator always sees the same script for a given published revision,
 * different creators are spread across the options, and a new revision may
 * reshuffle. Nothing here is random at render time.
 */
import type { PlaybookContent, ReferenceItem } from "./playbook-content";

export interface VariationKey {
  creatorId: string;
  playbookId: string;
  revision: number;
}

export interface PublishedPlaybook {
  content: PlaybookContent;
  descriptions: readonly string[];
  /** Normalized tags (no '#'), as stored on the revision. */
  hashtags: readonly string[];
}

export interface UgcSceneVariation {
  id: string;
  name: string;
  instructions: string;
  /** Chosen on-screen text; null when the scene has none. */
  onScreenText: string | null;
}

export interface SlideVariation {
  id: string;
  /** Chosen image for the slide; null when the slide has no image options. */
  image: ReferenceItem | null;
  /** Chosen caption/overlay text; null when the slide has none. */
  caption: string | null;
}

export type CreatorScript =
  | { kind: "ugc"; generalInstructions: string; references: ReferenceItem[]; scenes: UgcSceneVariation[] }
  | { kind: "slideshow"; generalInstructions: string; slides: SlideVariation[] };

export interface CreatorVariation {
  script: CreatorScript;
  /** Chosen post description; null when the playbook has none. */
  description: string | null;
  /** Display hashtags with '#': the playbook's tags, then the campaign's primary tag (deduplicated). */
  hashtags: string[];
}

/** 32-bit FNV-1a. Stable across runtimes; not used for anything security-relevant. */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic index into a list of `length` options for one slot of one creator's script. */
export function pickIndex(key: VariationKey, slot: string, length: number): number {
  if (length <= 0) return -1;
  return stableHash(`${key.creatorId}|${key.playbookId}|${key.revision}|${slot}`) % length;
}

function pick<T>(key: VariationKey, slot: string, options: readonly T[]): T | null {
  const index = pickIndex(key, slot, options.length);
  return index < 0 ? null : options[index];
}

const usable = (values: readonly string[]) => values.map((v) => v.trim()).filter(Boolean);

/** Final hashtag list shown to the creator: playbook tags then `#primary`, without duplicates. */
export function creatorHashtags(hashtags: readonly string[], primaryHashtag: string): string[] {
  const tags = [...hashtags, primaryHashtag].map((t) => t.trim().replace(/^#+/, "").toLowerCase()).filter(Boolean);
  return [...new Set(tags)].map((t) => `#${t}`);
}

export function creatorVariation(key: VariationKey, playbook: PublishedPlaybook, primaryHashtag: string): CreatorVariation {
  const { content } = playbook;
  const script: CreatorScript =
    content.kind === "ugc"
      ? {
          kind: "ugc",
          generalInstructions: content.generalInstructions,
          references: content.references,
          scenes: content.scenes.map((scene) => ({
            id: scene.id,
            name: scene.name,
            instructions: scene.instructions,
            onScreenText: pick(key, `scene:${scene.id}:text`, usable(scene.textOptions)),
          })),
        }
      : {
          kind: "slideshow",
          generalInstructions: content.generalInstructions,
          slides: content.slides.map((slide) => ({
            id: slide.id,
            image: pick(key, `slide:${slide.id}:image`, slide.imageOptions),
            caption: pick(key, `slide:${slide.id}:caption`, usable(slide.captionOptions)),
          })),
        };
  return {
    script,
    description: pick(key, "description", usable(playbook.descriptions)),
    hashtags: creatorHashtags(playbook.hashtags, primaryHashtag),
  };
}
