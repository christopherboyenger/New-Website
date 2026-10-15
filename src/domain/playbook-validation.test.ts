import { describe, expect, it } from "vitest";
import { emptyContent, type UgcContent } from "./playbook-content";
import { checkNewHashtag, draftPayloadSchema, publishIssues, snapshotsDiffer, validateReferenceUrl, type DraftPayload } from "./playbook-validation";

const scene = (overrides: Partial<UgcContent["scenes"][number]> = {}) => ({
  id: "scn_1",
  name: "Hook",
  instructions: "Say the hook",
  textOptions: [],
  ...overrides,
});
const ugc = (scenes = [scene()]): UgcContent => ({
  kind: "ugc",
  generalInstructions: "",
  references: [],
  scenes,
});

describe("validateReferenceUrl", () => {
  it("accepts https links", () => {
    expect(validateReferenceUrl(" https://example.com/video ")).toEqual({
      ok: true,
      url: "https://example.com/video",
    });
  });
  it.each(["", "example.com", "http://example.com/x", "javascript:alert(1)", "https://localhost/x", "https://user:pw@example.com/"])("rejects %j", (value) => {
    expect(validateReferenceUrl(value).ok).toBe(false);
  });
});

describe("checkNewHashtag", () => {
  it("normalizes '#Tag' to 'tag'", () => {
    expect(checkNewHashtag("#LaunchDay", [], "brand")).toEqual({
      ok: true,
      tag: "launchday",
    });
  });
  it("rejects invalid, duplicate and campaign-primary tags", () => {
    expect(checkNewHashtag("two words", [], "brand").ok).toBe(false);
    expect(checkNewHashtag("#fyp", ["fyp"], "brand").ok).toBe(false);
    const primary = checkNewHashtag("#Brand", [], "brand");
    expect(primary.ok).toBe(false);
    if (!primary.ok) expect(primary.error).toMatch(/always added/);
  });
});

describe("draftPayloadSchema", () => {
  const payload = (overrides: Partial<DraftPayload> = {}): DraftPayload => ({
    name: "Draft",
    templateId: null,
    content: ugc(),
    descriptions: ["d"],
    hashtags: ["fyp"],
    ...overrides,
  });

  it("accepts an incomplete UGC draft", () => {
    expect(draftPayloadSchema("ugc", "brand").safeParse(payload({ content: emptyContent("ugc"), descriptions: [""] })).success).toBe(true);
  });
  it("rejects content of the other format", () => {
    expect(draftPayloadSchema("slideshow", "brand").safeParse(payload()).success).toBe(false);
  });
  it("rejects the campaign primary hashtag, duplicates and un-normalized tags", () => {
    const schema = draftPayloadSchema("ugc", "brand");
    expect(schema.safeParse(payload({ hashtags: ["brand"] })).success).toBe(false);
    expect(schema.safeParse(payload({ hashtags: ["fyp", "fyp"] })).success).toBe(false);
    expect(schema.safeParse(payload({ hashtags: ["#FYP"] })).success).toBe(false);
  });
  it("rejects non-https references and uploaded asset ids", () => {
    const schema = draftPayloadSchema("ugc", "brand");
    const withRef = (ref: object) => payload({ content: { ...ugc(), references: [ref as never] } });
    expect(
      schema.safeParse(
        withRef({
          id: "r1",
          assetId: null,
          url: "https://example.com/v",
          title: "Ref",
        }),
      ).success,
    ).toBe(true);
    expect(
      schema.safeParse(
        withRef({
          id: "r1",
          assetId: null,
          url: "http://example.com/v",
          title: "Ref",
        }),
      ).success,
    ).toBe(false);
    expect(
      schema.safeParse(
        withRef({
          id: "r1",
          assetId: "med_x",
          url: "https://example.com/v",
          title: "Ref",
        }),
      ).success,
    ).toBe(false);
  });
  it("rejects templates of another format and duplicate scene ids", () => {
    const schema = draftPayloadSchema("ugc", "brand");
    expect(schema.safeParse(payload({ templateId: "slideshow-listicle" })).success).toBe(false);
    expect(schema.safeParse(payload({ templateId: "ugc-greenscreen" })).success).toBe(true);
    expect(schema.safeParse(payload({ content: ugc([scene(), scene()]) })).success).toBe(false);
  });
});

describe("publishIssues", () => {
  const base = {
    name: "Launch",
    content: ugc(),
    descriptions: ["Try this"],
    campaign: { id: "cmp_1" },
  };

  it("passes a complete UGC playbook", () => {
    expect(publishIssues(base)).toEqual([]);
  });
  it("requires a campaign, name, a scene and a description", () => {
    const keys = publishIssues({
      name: " ",
      content: ugc([]),
      descriptions: [],
      campaign: null,
    }).map((i) => i.key);
    expect(keys).toEqual(["campaign", "name", "scenes", "descriptions"]);
  });
  it("requires instructions in every scene and no blank on-screen text", () => {
    const issues = publishIssues({
      ...base,
      content: ugc([scene({ instructions: "" }), scene({ id: "scn_2", textOptions: [""] })]),
    });
    expect(issues.map((i) => i.key)).toEqual(["scene:scn_1", "scene:scn_2"]);
  });
  it("requires a caption on every slideshow slide", () => {
    const content = {
      kind: "slideshow" as const,
      generalInstructions: "",
      slides: [
        { id: "a", imageOptions: [], captionOptions: ["Hello"] },
        { id: "b", imageOptions: [], captionOptions: [] },
      ],
    };
    expect(publishIssues({ ...base, content }).map((i) => i.key)).toEqual(["slide:b"]);
    expect(publishIssues({ ...base, content: emptyContent("slideshow") }).map((i) => i.key)).toEqual(["slides"]);
  });
  it("flags a blank description next to a filled one", () => {
    expect(publishIssues({ ...base, descriptions: ["ok", ""] }).map((i) => i.key)).toEqual(["descriptions"]);
  });
});

describe("snapshotsDiffer", () => {
  it("ignores key order and detects real changes", () => {
    const a = { name: "x", content: ugc(), descriptions: ["d"], hashtags: [] };
    const reordered = {
      ...a,
      content: {
        scenes: a.content.scenes,
        references: [],
        generalInstructions: "",
        kind: "ugc" as const,
      },
    };
    expect(snapshotsDiffer(a, reordered)).toBe(false);
    expect(snapshotsDiffer(a, { ...a, descriptions: ["e"] })).toBe(true);
  });
});

describe("publishIssues for a new slide", () => {
  it("reports a slide with only an empty caption once", () => {
    const content = { kind: "slideshow" as const, generalInstructions: "", slides: [{ id: "a", imageOptions: [], captionOptions: [""] }] };
    expect(publishIssues({ name: "x", content, descriptions: ["d"], campaign: { id: "c" } })).toHaveLength(1);
  });
});
