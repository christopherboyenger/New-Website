import { describe, expect, it } from "vitest";
import {
  formatNamingDate,
  generateAdName,
  MAX_AD_NAME,
  moveField,
  namingConventionSchema,
  namingExample,
  namingTemplate,
  resolveAdName,
  sanitizeNamePart,
  type NamingConvention,
} from "./ad-naming";

const convention = (fields: NamingConvention["fields"], separator = "_"): NamingConvention => ({ fields, separator });
const date = new Date("2026-03-09T23:30:00.000Z");

describe("generateAdName", () => {
  it("joins fields in order with the separator and ends with the post ID", () => {
    const name = generateAdName({ convention: convention([{ kind: "custom", value: "Spring" }, { kind: "date" }, { kind: "creator" }]), creator: "@jo.makes", date, postId: "pst_abc123" });
    expect(name).toBe("Spring_20260309_jo.makes_pst_abc123");
  });

  it("respects the chosen separator and field order", () => {
    const name = generateAdName({ convention: convention([{ kind: "creator" }, { kind: "custom", value: "UGC" }], "-"), creator: "jo", date, postId: "pst_1" });
    expect(name).toBe("jo-UGC-pst_1");
  });

  it("formats the date as the UTC day", () => {
    expect(formatNamingDate(new Date("2026-12-31T23:59:59.999Z"))).toBe("20261231");
    // 01:00 on Jan 1 in UTC+2 is still Dec 31 in UTC
    expect(formatNamingDate(new Date("2026-01-01T01:00:00+02:00"))).toBe("20251231");
  });

  it("is just the post ID when there are no fields", () => {
    expect(generateAdName({ convention: convention([]), creator: "jo", date, postId: "pst_1" })).toBe("pst_1");
  });

  it("always ends with the post ID even when the head is truncated", () => {
    const long = "x".repeat(40);
    const fields = Array.from({ length: 6 }, () => ({ kind: "custom" as const, value: long }));
    const name = generateAdName({ convention: convention(fields), creator: "jo", date, postId: "pst_tail" });
    expect(name.endsWith("_pst_tail")).toBe(true);
    expect(name.length).toBeLessThanOrEqual(MAX_AD_NAME);
  });

  it("skips fields that sanitize to nothing", () => {
    const name = generateAdName({ convention: convention([{ kind: "custom", value: "!!!" }, { kind: "creator" }]), creator: "", date, postId: "pst_1" });
    expect(name).toBe("pst_1");
  });
});

describe("sanitizeNamePart", () => {
  it("replaces whitespace, drops unsafe characters and the active separator", () => {
    expect(sanitizeNamePart("  Summer  Drop / v2 ", "_")).toBe("Summer-Drop-v2");
    expect(sanitizeNamePart("a_b_c", "_")).toBe("abc");
    expect(sanitizeNamePart("a_b-c", "-")).toBe("a_bc");
    expect(sanitizeNamePart("Café 🎉", "_")).toBe("Café");
  });

  it("caps segment length", () => {
    expect(sanitizeNamePart("y".repeat(100), "_")).toHaveLength(40);
  });
});

describe("resolveAdName", () => {
  it("uses the generated name when the override is blank", () => {
    expect(resolveAdName("gen_pst_1", "  ")).toEqual({ ok: true, name: "gen_pst_1", overridden: false });
    expect(resolveAdName("gen_pst_1", null)).toEqual({ ok: true, name: "gen_pst_1", overridden: false });
  });

  it("lets an individual ad override the convention", () => {
    expect(resolveAdName("gen_pst_1", " Hero cut ")).toEqual({ ok: true, name: "Hero cut", overridden: true });
  });

  it("rejects overly long or multi-line overrides", () => {
    expect(resolveAdName("g", "a".repeat(MAX_AD_NAME + 1)).ok).toBe(false);
    expect(resolveAdName("g", "line\nbreak").ok).toBe(false);
  });
});

describe("namingConventionSchema", () => {
  it("accepts a valid convention", () => {
    expect(namingConventionSchema.safeParse(convention([{ kind: "custom", value: "Brand" }, { kind: "date" }])).success).toBe(true);
  });

  it("rejects duplicate date/creator fields, empty custom text and unknown separators", () => {
    expect(namingConventionSchema.safeParse(convention([{ kind: "date" }, { kind: "date" }])).success).toBe(false);
    expect(namingConventionSchema.safeParse(convention([{ kind: "custom", value: " " }])).success).toBe(false);
    expect(namingConventionSchema.safeParse(convention([], "/")).success).toBe(false);
  });

  it("rejects too many fields", () => {
    expect(namingConventionSchema.safeParse(convention(Array.from({ length: 7 }, () => ({ kind: "custom" as const, value: "a" })))).success).toBe(false);
  });
});

describe("previews and ordering", () => {
  it("shows the template with the fixed post ID tail and a labelled example", () => {
    const c = convention([{ kind: "custom", value: "Brand" }, { kind: "creator" }]);
    expect(namingTemplate(c)).toBe("<Brand>_<Creator>_<Post ID>");
    expect(namingExample(c)).toBe("Brand_example-creator_pst_example");
  });

  it("moves fields up and down within bounds", () => {
    expect(moveField(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveField(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveField(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
