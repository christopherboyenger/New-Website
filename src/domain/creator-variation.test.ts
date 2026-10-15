import { describe, expect, it } from "vitest";
import { creatorHashtags, creatorVariation, pickIndex, stableHash, type PublishedPlaybook } from "./creator-variation";

const ugc: PublishedPlaybook = {
  content: {
    kind: "ugc",
    generalInstructions: "Film in daylight.",
    references: [{ id: "ref1", assetId: null, url: "https://example.test/ref", title: "Reference" }],
    scenes: [
      { id: "s1", name: "Hook", instructions: "Say the hook.", textOptions: ["A", "B", "C", "D"] },
      { id: "s2", name: "Demo", instructions: "Show the app.", textOptions: [] },
    ],
  },
  descriptions: ["First description", "Second description", "  "],
  hashtags: ["ad", "summer"],
};

const slideshow: PublishedPlaybook = {
  content: {
    kind: "slideshow",
    generalInstructions: "",
    slides: [
      {
        id: "sl1",
        imageOptions: [
          { id: "i1", assetId: null, url: "https://example.test/1.jpg", title: "One" },
          { id: "i2", assetId: null, url: "https://example.test/2.jpg", title: "Two" },
        ],
        captionOptions: ["Cap 1", "Cap 2", "Cap 3"],
      },
      { id: "sl2", imageOptions: [], captionOptions: [] },
    ],
  },
  descriptions: [],
  hashtags: [],
};

describe("creator variation", () => {
  it("is deterministic for the same creator, playbook and revision", () => {
    const key = { creatorId: "crt_a", playbookId: "pbk_1", revision: 3 };
    expect(creatorVariation(key, ugc, "brand")).toEqual(creatorVariation({ ...key }, ugc, "brand"));
    expect(creatorVariation(key, slideshow, "brand")).toEqual(creatorVariation({ ...key }, slideshow, "brand"));
  });

  it("picks exactly one option per scene and one description, ignoring blank options", () => {
    const v = creatorVariation({ creatorId: "crt_a", playbookId: "pbk_1", revision: 1 }, ugc, "brand");
    if (v.script.kind !== "ugc") throw new Error("expected ugc");
    expect(["A", "B", "C", "D"]).toContain(v.script.scenes[0].onScreenText);
    expect(v.script.scenes[1].onScreenText).toBeNull();
    expect(["First description", "Second description"]).toContain(v.description);
    expect(v.script.references).toHaveLength(1);
  });

  it("picks an image and caption per slide, null when a slide has none", () => {
    const v = creatorVariation({ creatorId: "crt_b", playbookId: "pbk_2", revision: 1 }, slideshow, "brand");
    if (v.script.kind !== "slideshow") throw new Error("expected slideshow");
    expect(["i1", "i2"]).toContain(v.script.slides[0].image?.id);
    expect(["Cap 1", "Cap 2", "Cap 3"]).toContain(v.script.slides[0].caption);
    expect(v.script.slides[1]).toMatchObject({ image: null, caption: null });
    expect(v.description).toBeNull();
    expect(v.hashtags).toEqual(["#brand"]);
  });

  it("spreads different creators across the options", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(pickIndex({ creatorId: `crt_${i}`, playbookId: "pbk_1", revision: 1 }, "scene:s1:text", 4));
    expect(seen.size).toBe(4);
  });

  it("appends the primary hashtag once, normalized", () => {
    expect(creatorHashtags(["ad", "#Summer", "brand"], "#Brand")).toEqual(["#ad", "#summer", "#brand"]);
    expect(creatorHashtags([], "launch")).toEqual(["#launch"]);
  });

  it("uses a stable 32-bit hash", () => {
    expect(stableHash("")).toBe(0x811c9dc5);
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });
});
