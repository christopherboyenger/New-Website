import { describe, expect, it } from "vitest";
import { formatScriptCount, sampleVariation, scriptMath, slideshowHashtagSampleSize, slideshowScriptMath, ugcScriptMath } from "./playbook-combinatorics";
import type { SlideshowContent, UgcContent } from "./playbook-content";

const ugc = (scenes: Array<{ name: string; textOptions: string[] }>): UgcContent => ({
  kind: "ugc",
  generalInstructions: "",
  references: [],
  scenes: scenes.map((s, i) => ({ id: `s${i}`, instructions: "Do it", ...s })),
});

const link = (n: number) => ({
  id: `r${n}`,
  assetId: null,
  url: `https://example.test/${n}.jpg`,
  title: "",
});

describe("UGC unique-script math", () => {
  it("reproduces the observed example: one text option, one scene without text, two descriptions = 2", () => {
    const math = ugcScriptMath(
      ugc([
        { name: "Film your background", textOptions: ["One line"] },
        { name: "Green screen", textOptions: [] },
      ]),
      ["First", "Second"],
    );
    expect(math.total).toBe(2);
    expect(math.factors.map((f) => f.factor)).toEqual([1, 1, 2]);
    expect(math.factors[1].detail).toBe("no on-screen text yet");
    expect(math.factors[2].detail).toBe("2 description options + your hashtags");
  });

  it("two scenes with no text options and two descriptions = 2", () => {
    expect(
      ugcScriptMath(
        ugc([
          { name: "A", textOptions: [] },
          { name: "B", textOptions: [] },
        ]),
        ["x", "y"],
      ).total,
    ).toBe(2);
  });

  it("multiplies on-screen text options across scenes", () => {
    const math = ugcScriptMath(
      ugc([
        { name: "A", textOptions: ["1", "2", "3"] },
        { name: "B", textOptions: ["1", "2"] },
      ]),
      ["d1", "d2"],
    );
    expect(math.total).toBe(3 * 2 * 2);
  });

  it("ignores blank options and treats no descriptions as a factor of one", () => {
    const math = ugcScriptMath(ugc([{ name: "", textOptions: ["  ", "a"] }]), ["", " "]);
    expect(math.total).toBe(1);
    expect(math.factors[0].label).toBe("Scene 1");
    expect(math.descriptionFactor).toBe(1);
  });

  it("an empty playbook has exactly one script", () => {
    expect(ugcScriptMath(ugc([]), []).total).toBe(1);
  });
});

describe("Slideshow unique-script math", () => {
  const slideshow: SlideshowContent = {
    kind: "slideshow",
    generalInstructions: "",
    slides: [
      {
        id: "a",
        imageOptions: [link(1), link(2)],
        captionOptions: ["c1", "c2", "c3"],
      },
      { id: "b", imageOptions: [], captionOptions: ["only"] },
      { id: "c", imageOptions: [link(3)], captionOptions: [] },
    ],
  };

  it("is the product over slides of max(1, images) × max(1, captions), times descriptions", () => {
    const math = slideshowScriptMath(slideshow, ["d1", "d2"]);
    expect(math.factors.map((f) => f.factor)).toEqual([6, 1, 1, 2]);
    expect(math.total).toBe(12);
    expect(scriptMath(slideshow, ["d1", "d2"]).total).toBe(12);
  });

  it("formats large totals with grouping", () => {
    expect(formatScriptCount(12345)).toBe("12,345");
  });
});

describe("sampleVariation", () => {
  const content = ugc([
    { name: "Hook", textOptions: ["a", "b", "c"] },
    { name: "Demo", textOptions: [] },
  ]);
  const input = {
    content,
    descriptions: ["one", "two"],
    hashtags: ["fyp", "launch"],
    primaryHashtag: "brandtag",
  };

  it("is deterministic for a seed", () => {
    expect(sampleVariation(input, 4)).toEqual(sampleVariation(input, 4));
  });

  it("UGC carries every playbook hashtag then the campaign hashtag", () => {
    const sample = sampleVariation(input, 1);
    expect(sample.hashtags).toEqual(["fyp", "launch", "brandtag"]);
    if (sample.kind !== "ugc") throw new Error("expected ugc");
    expect(["a", "b", "c"]).toContain(sample.scenes[0].onScreenText);
    expect(sample.scenes[1].onScreenText).toBeNull();
    expect(["one", "two"]).toContain(sample.description);
  });

  it("shuffling eventually changes the chosen text", () => {
    const seen = new Set(
      Array.from(
        { length: 20 },
        (_, seed) =>
          (
            sampleVariation(input, seed) as {
              scenes: Array<{ onScreenText: string | null }>;
            }
          ).scenes[0].onScreenText,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("slideshow samples 2–3 playbook hashtags plus the campaign hashtag", () => {
    const slideshow: SlideshowContent = {
      kind: "slideshow",
      generalInstructions: "",
      slides: [{ id: "a", imageOptions: [], captionOptions: ["c"] }],
    };
    for (let seed = 0; seed < 25; seed++) {
      const sample = sampleVariation(
        {
          content: slideshow,
          descriptions: [],
          hashtags: ["a1", "b2", "c3", "d4", "e5"],
          primaryHashtag: "brandtag",
        },
        seed,
      );
      const playbookTags = sample.hashtags.slice(0, -1);
      expect(playbookTags.length).toBeGreaterThanOrEqual(2);
      expect(playbookTags.length).toBeLessThanOrEqual(3);
      expect(new Set(playbookTags).size).toBe(playbookTags.length);
      expect(sample.hashtags.at(-1)).toBe("brandtag");
      expect(sample.description).toBeNull();
    }
    expect(slideshowHashtagSampleSize(1, 3)).toBe(1);
    expect(slideshowHashtagSampleSize(0, 3)).toBe(0);
  });
});
