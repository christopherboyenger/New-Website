import { describe, expect, it } from "vitest";
import {
  countryCodes,
  countryName,
  countryOptions,
  isCountryCode,
  isUsMetroId,
  matchesCatalogQuery,
  metroTargetingApplies,
  usMetroAreas,
  usMetroLabel,
  usMetroOptions,
} from "./targeting-catalog";

describe("country catalog", () => {
  it("lists the 249 assigned ISO 3166-1 alpha-2 codes, unique and well-formed", () => {
    expect(countryCodes).toHaveLength(249);
    expect(new Set(countryCodes).size).toBe(countryCodes.length);
    for (const code of countryCodes) expect(code).toMatch(/^[A-Z]{2}$/);
    expect([...countryCodes]).toEqual([...countryCodes].sort());
  });

  it("recognizes real codes and rejects user-assigned or malformed ones", () => {
    expect(isCountryCode("US")).toBe(true);
    expect(isCountryCode("GB")).toBe(true);
    expect(isCountryCode("UK")).toBe(false);
    expect(isCountryCode("XK")).toBe(false);
    expect(isCountryCode("us")).toBe(false);
  });

  it("derives names from Intl.DisplayNames and sorts options by name", () => {
    expect(countryName("US")).toBe("United States");
    expect(countryName("DE")).toBe("Germany");
    const options = countryOptions();
    expect(options).toHaveLength(249);
    const labels = options.map((o) => o.label);
    expect(labels).toEqual([...labels].sort(new Intl.Collator("en").compare));
    for (const option of options) expect(option.label).not.toBe("");
  });

  it("matches search queries against names and codes, ignoring case and accents", () => {
    const curacao = countryOptions().find((o) => o.id === "CW")!;
    expect(matchesCatalogQuery(curacao, "curacao")).toBe(true);
    expect(matchesCatalogQuery(curacao, "CW")).toBe(true);
    expect(matchesCatalogQuery(curacao, "germany")).toBe(false);
    expect(matchesCatalogQuery(curacao, "   ")).toBe(true);
  });
});

describe("US metro catalog", () => {
  it("has exactly 50 metros with unique, stable slug IDs and unique names", () => {
    expect(usMetroAreas).toHaveLength(50);
    const ids = usMetroAreas.map((m) => m.id);
    expect(new Set(ids).size).toBe(50);
    expect(new Set(usMetroAreas.map((m) => m.name)).size).toBe(50);
    for (const metro of usMetroAreas) {
      expect(metro.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(metro.id.length).toBeLessThanOrEqual(80);
      // Census MSA titles end with state abbreviations, e.g. ", NY-NJ".
      expect(metro.name).toMatch(/, [A-Z]{2}(-[A-Z]{2})*$/);
      expect(metro.shortName.trim()).not.toBe("");
    }
  });

  it("looks up labels by ID and keeps unknown IDs visible instead of dropping them", () => {
    expect(isUsMetroId("new-york")).toBe(true);
    expect(isUsMetroId("springfield")).toBe(false);
    expect(usMetroLabel("seattle")).toBe("Seattle");
    expect(usMetroLabel("retired-id")).toBe("retired-id");
  });

  it("offers metros sorted by short name and searchable by the Census title", () => {
    const options = usMetroOptions();
    expect(options.map((o) => o.label)).toEqual([...options.map((o) => o.label)].sort((a, b) => a.localeCompare(b, "en")));
    const sf = options.find((o) => o.id === "san-francisco-oakland")!;
    expect(matchesCatalogQuery(sf, "fremont")).toBe(true);
  });

  it("applies metro targeting only when US creators are in scope", () => {
    expect(metroTargetingApplies([])).toBe(true);
    expect(metroTargetingApplies(["US", "CA"])).toBe(true);
    expect(metroTargetingApplies(["CA", "MX"])).toBe(false);
  });
});
