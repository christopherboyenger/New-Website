/**
 * Unique-script math and deterministic sample variations for playbooks.
 *
 * UGC (observed L06): one script × each scene's on-screen text options (a scene
 * with none contributes ×1) × post description options (none contributes ×1).
 * Hashtags never multiply: in UGC they end every post.
 *
 * Slideshow (documented slideshow guide): one image option and one caption
 * option are chosen per slide, and one description per post, so the count is
 * Π over slides of max(1, images) × max(1, captions), × max(1, descriptions).
 * Slideshow posts sample 2–3 playbook hashtags plus the campaign's primary
 * hashtag; UGC posts carry every playbook hashtag plus the primary hashtag.
 * The two formats' rules are never mixed (evidence audit item 7).
 */
import type { PlaybookContent, ReferenceItem, SlideshowContent, UgcContent } from "./playbook-content";

export interface ScriptMathFactor {
  /** Row label, e.g. the scene name or "Slide 2". */
  label: string;
  /** Human explanation of the options counted. */
  detail: string;
  factor: number;
}

export interface ScriptMath {
  factors: ScriptMathFactor[];
  /** Factor contributed by description options. */
  descriptionFactor: number;
  total: number;
}

const nonBlank = (values: readonly string[]) => values.filter((v) => v.trim().length > 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Options that count toward combinations: blank text is ignored. */
export function countedOptions(values: readonly string[]): number {
  return nonBlank(values).length;
}

function descriptionRow(descriptions: readonly string[]): ScriptMathFactor {
  const n = countedOptions(descriptions);
  return {
    label: "Post description",
    detail: n === 0 ? "no description options yet" : `${plural(n, "description option")} + your hashtags`,
    factor: Math.max(1, n),
  };
}

export function ugcScriptMath(content: UgcContent, descriptions: readonly string[]): ScriptMath {
  const factors = content.scenes.map((scene, index): ScriptMathFactor => {
    const n = countedOptions(scene.textOptions);
    return {
      label: scene.name.trim() || `Scene ${index + 1}`,
      detail: n === 0 ? "no on-screen text yet" : plural(n, "on-screen text option"),
      factor: Math.max(1, n),
    };
  });
  return finish(factors, descriptionRow(descriptions));
}

export function slideshowScriptMath(content: SlideshowContent, descriptions: readonly string[]): ScriptMath {
  const factors = content.slides.map((slide, index): ScriptMathFactor => {
    const images = slide.imageOptions.length;
    const captions = countedOptions(slide.captionOptions);
    return {
      label: `Slide ${index + 1}`,
      detail: `${plural(images, "image option")} × ${plural(captions, "caption option")}`,
      factor: Math.max(1, images) * Math.max(1, captions),
    };
  });
  return finish(factors, descriptionRow(descriptions));
}

function finish(factors: ScriptMathFactor[], description: ScriptMathFactor): ScriptMath {
  const all = [...factors, description];
  const total = all.reduce((product, f) => product * f.factor, 1);
  return { factors: all, descriptionFactor: description.factor, total };
}

export function scriptMath(content: PlaybookContent, descriptions: readonly string[]): ScriptMath {
  return content.kind === "ugc" ? ugcScriptMath(content, descriptions) : slideshowScriptMath(content, descriptions);
}

/** Number shown in the rail; formatted with grouping. */
export function formatScriptCount(total: number): string {
  return Number.isFinite(total) ? total.toLocaleString("en-US") : "Too many to count";
}

/* ----------------------------------------------------------------------------
 * Deterministic sample variation (creator-app preview "Shuffle").
 * The same seed always yields the same variation, so previews are stable
 * across renders and server/client.
 * ------------------------------------------------------------------------- */

/** Small deterministic integer hash (mulberry32 step). */
function hash(seed: number, salt: number): number {
  let t = (seed * 0x9e3779b1 + salt * 0x85ebca6b) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

function pick<T>(items: readonly T[], seed: number, salt: number): T | null {
  if (items.length === 0) return null;
  return items[hash(seed, salt) % items.length];
}

/** Picks `count` distinct items in a seed-determined order. */
function pickMany<T>(items: readonly T[], count: number, seed: number, salt: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = hash(seed, salt + i) % pool.length;
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

/** Playbook hashtags followed by the campaign primary hashtag (always last, never duplicated). */
function withPrimary(tags: readonly string[], primaryHashtag: string): string[] {
  return [...tags.filter((t) => t !== primaryHashtag), primaryHashtag];
}

export interface UgcSampleScene {
  id: string;
  name: string;
  instructions: string;
  onScreenText: string | null;
}

export interface SlideshowSampleSlide {
  id: string;
  image: ReferenceItem | null;
  imageCount: number;
  caption: string | null;
}

export type SampleVariation =
  | {
      kind: "ugc";
      scenes: UgcSampleScene[];
      description: string | null;
      hashtags: string[];
    }
  | {
      kind: "slideshow";
      slides: SlideshowSampleSlide[];
      description: string | null;
      hashtags: string[];
    };

/** How many playbook hashtags a slideshow post samples (2–3 per the slideshow guide). */
export function slideshowHashtagSampleSize(available: number, seed: number): number {
  if (available <= 2) return available;
  return 2 + (hash(seed, 7919) % 2);
}

export function sampleVariation(
  input: {
    content: PlaybookContent;
    descriptions: readonly string[];
    hashtags: readonly string[];
    primaryHashtag: string;
  },
  seed: number,
): SampleVariation {
  const description = pick(nonBlank(input.descriptions), seed, 1);
  if (input.content.kind === "ugc") {
    return {
      kind: "ugc",
      scenes: input.content.scenes.map((scene, i) => ({
        id: scene.id,
        name: scene.name,
        instructions: scene.instructions,
        onScreenText: pick(nonBlank(scene.textOptions), seed, 100 + i),
      })),
      description,
      hashtags: withPrimary(input.hashtags, input.primaryHashtag),
    };
  }
  const sampled = pickMany(input.hashtags, slideshowHashtagSampleSize(input.hashtags.length, seed), seed, 5000);
  return {
    kind: "slideshow",
    slides: input.content.slides.map((slide, i) => ({
      id: slide.id,
      image: pick(slide.imageOptions, seed, 200 + i),
      imageCount: slide.imageOptions.length,
      caption: pick(nonBlank(slide.captionOptions), seed, 300 + i),
    })),
    description,
    hashtags: withPrimary(sampled, input.primaryHashtag),
  };
}
