/**
 * Client-side draft model for the playbook editor: a pure reducer over the
 * editable snapshot (name, content, descriptions, hashtags). Nothing here
 * persists; the editor shell saves through the saveDraft Server Action.
 */
import type { PlaybookContent, ReferenceItem, SlideshowContent, UgcContent } from "@/domain/playbook-content";
import type { DraftPayload } from "@/domain/playbook-validation";
import { newId } from "@/lib/ids";

export type Draft = DraftPayload;

export type SaveStatus = "saved" | "dirty" | "saving" | "conflict" | "error";

export type ItemList = "scenes" | "slides";

export type DraftAction =
  | { type: "replace"; draft: Draft }
  | { type: "rename"; name: string }
  | { type: "general"; value: string }
  | {
      type: "applyTemplate";
      templateId: string;
      content: PlaybookContent;
      descriptions: string[];
    }
  | {
      type: "setDescriptionsAndHashtags";
      descriptions: string[];
      hashtags: string[];
    }
  // UGC
  | { type: "addReference"; reference: Omit<ReferenceItem, "id"> }
  | { type: "removeReference"; id: string }
  | { type: "addScene" }
  | {
      type: "updateScene";
      id: string;
      patch: Partial<{ name: string; instructions: string }>;
    }
  | { type: "setSceneText"; id: string; textOptions: string[] }
  // Slideshow
  | { type: "addSlide" }
  | { type: "addSlideImage"; id: string; image: Omit<ReferenceItem, "id"> }
  | { type: "removeSlideImage"; id: string; imageId: string }
  | { type: "setSlideCaptions"; id: string; captionOptions: string[] }
  // Shared ordering
  | { type: "removeItem"; id: string }
  | { type: "moveItem"; id: string; offset: -1 | 1 };

function withUgc(draft: Draft, fn: (c: UgcContent) => UgcContent): Draft {
  return draft.content.kind === "ugc" ? { ...draft, content: fn(draft.content) } : draft;
}

function withSlideshow(draft: Draft, fn: (c: SlideshowContent) => SlideshowContent): Draft {
  return draft.content.kind === "slideshow" ? { ...draft, content: fn(draft.content) } : draft;
}

function move<T extends { id: string }>(items: T[], id: string, offset: -1 | 1): T[] {
  const from = items.findIndex((i) => i.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "replace":
      return action.draft;
    case "rename":
      return { ...draft, name: action.name };
    case "general":
      return {
        ...draft,
        content: { ...draft.content, generalInstructions: action.value },
      };
    case "applyTemplate":
      return {
        ...draft,
        templateId: action.templateId,
        content: action.content,
        descriptions: action.descriptions,
      };
    case "setDescriptionsAndHashtags":
      return {
        ...draft,
        descriptions: action.descriptions,
        hashtags: action.hashtags,
      };
    case "addReference":
      return withUgc(draft, (c) => ({
        ...c,
        references: [...c.references, { id: newId("ref"), ...action.reference }],
      }));
    case "removeReference":
      return withUgc(draft, (c) => ({
        ...c,
        references: c.references.filter((r) => r.id !== action.id),
      }));
    case "addScene":
      return withUgc(draft, (c) => ({
        ...c,
        scenes: [...c.scenes, { id: newId("scn"), name: "", instructions: "", textOptions: [] }],
      }));
    case "updateScene":
      return withUgc(draft, (c) => ({
        ...c,
        scenes: c.scenes.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      }));
    case "setSceneText":
      return withUgc(draft, (c) => ({
        ...c,
        scenes: c.scenes.map((s) => (s.id === action.id ? { ...s, textOptions: action.textOptions } : s)),
      }));
    case "addSlide":
      return withSlideshow(draft, (c) => ({
        ...c,
        slides: [...c.slides, { id: newId("sld"), imageOptions: [], captionOptions: [""] }],
      }));
    case "addSlideImage":
      return withSlideshow(draft, (c) => ({
        ...c,
        slides: c.slides.map((s) =>
          s.id === action.id
            ? {
                ...s,
                imageOptions: [...s.imageOptions, { id: newId("ref"), ...action.image }],
              }
            : s,
        ),
      }));
    case "removeSlideImage":
      return withSlideshow(draft, (c) => ({
        ...c,
        slides: c.slides.map((s) =>
          s.id === action.id
            ? {
                ...s,
                imageOptions: s.imageOptions.filter((i) => i.id !== action.imageId),
              }
            : s,
        ),
      }));
    case "setSlideCaptions":
      return withSlideshow(draft, (c) => ({
        ...c,
        slides: c.slides.map((s) => (s.id === action.id ? { ...s, captionOptions: action.captionOptions } : s)),
      }));
    case "removeItem":
      return draft.content.kind === "ugc"
        ? withUgc(draft, (c) => ({
            ...c,
            scenes: c.scenes.filter((s) => s.id !== action.id),
          }))
        : withSlideshow(draft, (c) => ({
            ...c,
            slides: c.slides.filter((s) => s.id !== action.id),
          }));
    case "moveItem":
      return draft.content.kind === "ugc"
        ? withUgc(draft, (c) => ({
            ...c,
            scenes: move(c.scenes, action.id, action.offset),
          }))
        : withSlideshow(draft, (c) => ({
            ...c,
            slides: move(c.slides, action.id, action.offset),
          }));
  }
}

/** Template content with fresh identifiers so applied scenes/slides never share ids. */
export function instantiateTemplateContent(content: PlaybookContent): PlaybookContent {
  const clone = structuredClone(content);
  if (clone.kind === "ugc") clone.scenes = clone.scenes.map((s) => ({ ...s, id: newId("scn") }));
  else
    clone.slides = clone.slides.map((s) => ({
      ...s,
      id: newId("sld"),
      imageOptions: s.imageOptions.map((i) => ({ ...i, id: newId("ref") })),
    }));
  return clone;
}

/** Whether a scene/slide holds anything worth confirming before deletion. */
export function itemHasContent(content: PlaybookContent, id: string): boolean {
  if (content.kind === "ugc") {
    const s = content.scenes.find((x) => x.id === id);
    return Boolean(s && (s.name.trim() || s.instructions.trim() || s.textOptions.some((t) => t.trim())));
  }
  const s = content.slides.find((x) => x.id === id);
  return Boolean(s && (s.imageOptions.length > 0 || s.captionOptions.some((t) => t.trim())));
}

/** Whether the working draft holds any authored content (template application asks first). */
export function draftHasContent(draft: Draft): boolean {
  const c = draft.content;
  if (c.generalInstructions.trim() || draft.descriptions.some((d) => d.trim())) return true;
  return c.kind === "ugc" ? c.references.length > 0 || c.scenes.some((s) => itemHasContent(c, s.id)) : c.slides.some((s) => itemHasContent(c, s.id));
}

export function itemDomId(id: string): string {
  return `item-${id}`;
}

export function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const saveStatusLabels: Record<SaveStatus, string> = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  conflict: "Conflict",
  error: "Not saved",
};
