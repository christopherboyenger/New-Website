/**
 * Playbook draft and publish validation (framework-free).
 *
 * Draft saves are structurally validated but allow incomplete work (empty
 * scenes, blank options). Publishing additionally requires the content a
 * creator needs to follow the brief (PLAYBOOKS-03 in docs/decisions/playbooks.md).
 */
import { z } from "zod";
import { isValidHashtag, normalizeHashtag } from "./campaign";
import type { ContentFormat, PlaybookContent } from "./playbook-content";
import { findTemplate } from "./playbook-templates";

export const playbookLimits = {
  name: 120,
  instructions: 5000,
  sceneName: 120,
  textOption: 300,
  caption: 300,
  scenes: 30,
  slides: 20,
  optionsPerItem: 20,
  references: 20,
  referenceTitle: 120,
  url: 2048,
  descriptions: 20,
  /** Longest caption length accepted by the platforms creators post to. */
  description: 2200,
  hashtags: 30,
} as const;

/* ------------------------------------------------------------------ links */

/** Only absolute https links with a host are accepted as references/image options. */
export function validateReferenceUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const value = input.trim();
  if (!value) return { ok: false, error: "Enter a link." };
  if (value.length > playbookLimits.url) return { ok: false, error: "That link is too long." };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Enter a full link starting with https://" };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "Use a secure link that starts with https://" };
  if (!parsed.hostname.includes(".") || parsed.username || parsed.password) return { ok: false, error: "Enter a valid public link." };
  return { ok: true, url: parsed.toString() };
}

/* -------------------------------------------------------------- hashtags */

export type HashtagCheck = { ok: true; tag: string } | { ok: false; error: string };

/** Normalizes and validates a hashtag a brand types into "Add hashtag". */
export function checkNewHashtag(input: string, existing: readonly string[], primaryHashtag: string): HashtagCheck {
  const tag = normalizeHashtag(input);
  if (!tag) return { ok: false, error: "Type a hashtag first." };
  if (!isValidHashtag(tag))
    return {
      ok: false,
      error: "Use 2–50 letters, numbers or underscores (no spaces).",
    };
  if (tag === primaryHashtag)
    return {
      ok: false,
      error: `#${primaryHashtag} is the campaign hashtag and is always added automatically.`,
    };
  if (existing.includes(tag)) return { ok: false, error: `#${tag} is already added.` };
  if (existing.length >= playbookLimits.hashtags)
    return {
      ok: false,
      error: `You can add up to ${playbookLimits.hashtags} hashtags.`,
    };
  return { ok: true, tag };
}

/* ---------------------------------------------------------- draft schema */

const itemId = z.string().trim().min(1).max(64);

const referenceSchema = z.object({
  id: itemId,
  // Media storage is not provisioned: only external links can be referenced.
  assetId: z.null(),
  url: z
    .string()
    .max(playbookLimits.url)
    .superRefine((value, ctx) => {
      const result = validateReferenceUrl(value);
      if (!result.ok) ctx.addIssue({ code: "custom", message: result.error });
    }),
  title: z.string().trim().max(playbookLimits.referenceTitle, `Keep titles under ${playbookLimits.referenceTitle} characters.`),
});

const textOptions = (max: number, label: string) =>
  z.array(z.string().max(max, `Keep ${label} under ${max} characters.`)).max(playbookLimits.optionsPerItem, `Up to ${playbookLimits.optionsPerItem} options.`);

export const ugcContentSchema = z.object({
  kind: z.literal("ugc"),
  generalInstructions: z.string().max(playbookLimits.instructions, `Keep instructions under ${playbookLimits.instructions} characters.`),
  references: z.array(referenceSchema).max(playbookLimits.references, `Up to ${playbookLimits.references} references.`),
  scenes: z
    .array(
      z.object({
        id: itemId,
        name: z.string().max(playbookLimits.sceneName, `Keep scene names under ${playbookLimits.sceneName} characters.`),
        instructions: z.string().max(playbookLimits.instructions, `Keep instructions under ${playbookLimits.instructions} characters.`),
        textOptions: textOptions(playbookLimits.textOption, "on-screen text"),
      }),
    )
    .max(playbookLimits.scenes, `Up to ${playbookLimits.scenes} scenes.`),
});

export const slideshowContentSchema = z.object({
  kind: z.literal("slideshow"),
  generalInstructions: z.string().max(playbookLimits.instructions, `Keep instructions under ${playbookLimits.instructions} characters.`),
  slides: z
    .array(
      z.object({
        id: itemId,
        imageOptions: z.array(referenceSchema).max(playbookLimits.optionsPerItem, `Up to ${playbookLimits.optionsPerItem} image options.`),
        captionOptions: textOptions(playbookLimits.caption, "captions"),
      }),
    )
    .max(playbookLimits.slides, `Up to ${playbookLimits.slides} slides.`),
});

export function draftPayloadSchema(format: ContentFormat, primaryHashtag: string) {
  return z
    .object({
      name: z.string().trim().max(playbookLimits.name, `Keep the name under ${playbookLimits.name} characters.`),
      templateId: z.string().max(64).nullable(),
      content: format === "ugc" ? ugcContentSchema : slideshowContentSchema,
      descriptions: z
        .array(z.string().max(playbookLimits.description, `Keep descriptions under ${playbookLimits.description} characters.`))
        .max(playbookLimits.descriptions, `Up to ${playbookLimits.descriptions} descriptions.`),
      hashtags: z
        .array(z.string().refine(isValidHashtag, "Hashtags use 2–50 lowercase letters, numbers or underscores."))
        .max(playbookLimits.hashtags, `Up to ${playbookLimits.hashtags} hashtags.`),
    })
    .superRefine((value, ctx) => {
      if (new Set(value.hashtags).size !== value.hashtags.length)
        ctx.addIssue({
          code: "custom",
          path: ["hashtags"],
          message: "Each hashtag can only be added once.",
        });
      if (value.hashtags.includes(primaryHashtag)) {
        ctx.addIssue({
          code: "custom",
          path: ["hashtags"],
          message: `#${primaryHashtag} is the campaign hashtag and is added automatically.`,
        });
      }
      if (value.templateId !== null) {
        const template = findTemplate(value.templateId);
        if (!template || template.format !== format)
          ctx.addIssue({
            code: "custom",
            path: ["templateId"],
            message: "That template isn't available for this format.",
          });
      }
      const ids = value.content.kind === "ugc" ? value.content.scenes.map((s) => s.id) : value.content.slides.map((s) => s.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: ["content"],
          message: "Each scene or slide needs a unique identifier.",
        });
    });
}

export interface DraftPayload {
  name: string;
  templateId: string | null;
  content: PlaybookContent;
  descriptions: string[];
  hashtags: string[];
}

/* ---------------------------------------------------------- publish rules */

export interface PublishIssue {
  /** Stable key for UI targeting: "name", "scenes", "scene:<id>", "slides", "slide:<id>", "descriptions", "campaign". */
  key: string;
  message: string;
}

export function publishIssues(input: {
  name: string;
  content: PlaybookContent;
  descriptions: readonly string[];
  campaign: { id: string } | null;
}): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (!input.campaign)
    issues.push({
      key: "campaign",
      message: "Attach this playbook to a campaign before publishing.",
    });
  if (!input.name.trim()) issues.push({ key: "name", message: "Give the playbook a name." });

  const content = input.content;
  if (content.kind === "ugc") {
    if (content.scenes.length === 0) issues.push({ key: "scenes", message: "Add at least one scene." });
    content.scenes.forEach((scene, i) => {
      const label = scene.name.trim() || `Scene ${i + 1}`;
      if (!scene.instructions.trim())
        issues.push({
          key: `scene:${scene.id}`,
          message: `${label}: add instructions for creators.`,
        });
      if (scene.textOptions.some((t) => !t.trim()))
        issues.push({
          key: `scene:${scene.id}`,
          message: `${label}: fill in or remove the empty on-screen text.`,
        });
    });
  } else {
    if (content.slides.length === 0) issues.push({ key: "slides", message: "Add at least one slide." });
    content.slides.forEach((slide, i) => {
      const captions = slide.captionOptions.filter((c) => c.trim());
      if (captions.length === 0)
        issues.push({
          key: `slide:${slide.id}`,
          message: `Slide ${i + 1}: add at least one caption option.`,
        });
      else if (slide.captionOptions.some((c) => !c.trim()))
        issues.push({
          key: `slide:${slide.id}`,
          message: `Slide ${i + 1}: fill in or remove the empty caption.`,
        });
    });
  }

  if (!input.descriptions.some((d) => d.trim()))
    issues.push({
      key: "descriptions",
      message: "Add at least one post description.",
    });
  if (input.descriptions.some((d) => !d.trim()) && input.descriptions.some((d) => d.trim())) {
    issues.push({
      key: "descriptions",
      message: "Fill in or remove the empty description option.",
    });
  }
  return issues;
}

/* ----------------------------------------------------- revision comparison */

export interface PlaybookSnapshot {
  name: string;
  content: PlaybookContent;
  descriptions: readonly string[];
  hashtags: readonly string[];
}

/** Stable JSON (sorted object keys) so key order never reads as a change. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Whether the working draft differs from a (published) snapshot. */
export function snapshotsDiffer(a: PlaybookSnapshot, b: PlaybookSnapshot): boolean {
  return stable({ n: a.name, c: a.content, d: a.descriptions, h: a.hashtags }) !== stable({ n: b.name, c: b.content, d: b.descriptions, h: b.hashtags });
}
