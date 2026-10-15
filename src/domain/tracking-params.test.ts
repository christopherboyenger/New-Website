import { describe, expect, it } from "vitest";
import { copyTemplatesSchema, fillCopyTemplate, linkSettingsSchema, parseWebsiteUrl, resolveTrackingUrl, tokensIn } from "./tracking-params";

describe("parseWebsiteUrl", () => {
  it("accepts https URLs with a real host", () => {
    expect(parseWebsiteUrl("https://shop.example.com/p?x=1")?.hostname).toBe("shop.example.com");
  });

  it("rejects http, credentials, bare hosts and garbage", () => {
    expect(parseWebsiteUrl("http://example.com")).toBeNull();
    expect(parseWebsiteUrl("https://user:pw@example.com")).toBeNull();
    expect(parseWebsiteUrl("https://localhost")).toBeNull();
    expect(parseWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(parseWebsiteUrl("example.com")).toBeNull();
    expect(parseWebsiteUrl("")).toBeNull();
  });
});

describe("resolveTrackingUrl", () => {
  const links = {
    websiteUrl: "https://example.com/landing",
    params: [
      { key: "utm_source", value: "{{platform}}" },
      { key: "utm_campaign", value: "spring sale & more" },
      { key: "adset", value: "{{adset.id}}" },
    ],
  };

  it("substitutes {{platform}} and keeps Meta macros literal on Meta", () => {
    expect(resolveTrackingUrl(links, "meta")).toEqual({
      url: "https://example.com/landing?utm_source=meta&utm_campaign=spring%20sale%20%26%20more&adset={{adset.id}}",
      omitted: [],
    });
  });

  it("drops parameters that use Meta-only macros on TikTok and reports them", () => {
    expect(resolveTrackingUrl(links, "tiktok")).toEqual({
      url: "https://example.com/landing?utm_source=tiktok&utm_campaign=spring%20sale%20%26%20more",
      omitted: [{ key: "adset", reason: "Uses a Meta-only macro" }],
    });
  });

  it("keeps existing query parameters and replaces keys that the settings define", () => {
    const r = resolveTrackingUrl({ websiteUrl: "https://example.com/?ref=bio&utm_source=old#top", params: [{ key: "utm_source", value: "{{platform}}" }] }, "meta");
    expect(r.url).toBe("https://example.com/?ref=bio&utm_source=meta#top");
  });

  it("returns no URL when the website URL is missing or invalid", () => {
    expect(resolveTrackingUrl({ websiteUrl: "", params: [] }, "meta").url).toBeNull();
    expect(resolveTrackingUrl({ websiteUrl: "http://example.com", params: [] }, "meta").url).toBeNull();
  });
});

describe("linkSettingsSchema", () => {
  it("accepts valid settings", () => {
    expect(linkSettingsSchema.safeParse({ websiteUrl: "https://example.com", params: [{ key: "utm_source", value: "{{platform}}" }] }).success).toBe(true);
    expect(linkSettingsSchema.safeParse({ websiteUrl: "", params: [] }).success).toBe(true);
  });

  it("rejects an invalid URL", () => {
    const r = linkSettingsSchema.safeParse({ websiteUrl: "http://example.com", params: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["websiteUrl"]);
  });

  it("rejects duplicate keys case-insensitively, pointing at the duplicate", () => {
    const r = linkSettingsSchema.safeParse({
      websiteUrl: "https://example.com",
      params: [
        { key: "utm_source", value: "a" },
        { key: "UTM_SOURCE", value: "b" },
      ],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["params", 1, "key"]);
  });

  it("rejects unknown tokens, unbalanced braces, bad keys and params without a URL", () => {
    const bad = (params: Array<{ key: string; value: string }>, websiteUrl = "https://example.com") => linkSettingsSchema.safeParse({ websiteUrl, params }).success;
    expect(bad([{ key: "x", value: "{{creator}}" }])).toBe(false);
    expect(bad([{ key: "x", value: "{{platform}" }])).toBe(false);
    expect(bad([{ key: "has space", value: "v" }])).toBe(false);
    expect(bad([{ key: "x", value: "v" }], "")).toBe(false);
  });
});

describe("copy templates", () => {
  it("replaces known tokens and reports missing values", () => {
    const r = fillCopyTemplate("Made by {{creator}} for {{brand}} {{hashtag}}", { creator: "Jo", brand: "Acme", hashtag: null });
    expect(r).toEqual({ text: "Made by Jo for Acme", missing: ["hashtag"] });
  });

  it("leaves unknown tokens in place for validation", () => {
    expect(fillCopyTemplate("Hi {{nope}}", {}).text).toBe("Hi {{nope}}");
    expect(tokensIn("a {{ creator }} b {{brand}}")).toEqual(["creator", "brand"]);
  });

  it("validates templates", () => {
    expect(copyTemplatesSchema.safeParse(["Try it, {{handle}}"]).success).toBe(true);
    expect(copyTemplatesSchema.safeParse([" "]).success).toBe(false);
    expect(copyTemplatesSchema.safeParse(["{{price}}"]).success).toBe(false);
  });
});
