/**
 * Format-specific playbook content. UGC and Slideshow are separate schemas
 * (docs/spec/reference-build-specification.md "Playbook guide scope"): slideshow
 * sampling rules never apply to UGC and vice versa.
 */

export const contentFormats = ["slideshow", "ugc"] as const;
export type ContentFormat = (typeof contentFormats)[number];

export const contentFormatLabels: Record<ContentFormat, string> = {
  slideshow: "Slideshow",
  ugc: "UGC",
};

export interface UgcScene {
  id: string;
  name: string;
  instructions: string;
  /** On-screen text options; one is chosen per creator script. Empty = no on-screen text (factor 1). */
  textOptions: string[];
}

export interface ReferenceItem {
  id: string;
  /** Uploaded asset (when storage is provisioned) or an external URL the brand pasted. */
  assetId: string | null;
  url: string | null;
  title: string;
}

export interface UgcContent {
  kind: "ugc";
  generalInstructions: string;
  references: ReferenceItem[];
  scenes: UgcScene[];
}

export interface SlideshowSlide {
  id: string;
  /** Media group: image options for this slide (one chosen at random per post). */
  imageOptions: ReferenceItem[];
  /** Caption/overlay text options (one chosen at random per post). */
  captionOptions: string[];
}

export interface SlideshowContent {
  kind: "slideshow";
  generalInstructions: string;
  slides: SlideshowSlide[];
}

export type PlaybookContent = UgcContent | SlideshowContent;

export function emptyContent(format: ContentFormat): PlaybookContent {
  return format === "ugc"
    ? { kind: "ugc", generalInstructions: "", references: [], scenes: [] }
    : { kind: "slideshow", generalInstructions: "", slides: [] };
}
