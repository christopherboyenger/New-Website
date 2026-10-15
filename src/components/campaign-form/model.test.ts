import { describe, expect, it } from "vitest";
import {
  buildSubmission,
  campaignNamePlaceholder,
  firstInvalidField,
  forecastReasonText,
  hashtagBase,
  hashtagPlaceholder,
  initialCampaignFormState,
  isFormDirty,
  normalizeFieldErrors,
  parseDollarsToCents,
  sectionForErrorKey,
  sectionSummaries,
  sectionsWithErrors,
  suggestHashtags,
  weeklyAverageCents,
} from "./model";

describe("money parsing", () => {
  it("parses typed dollars into integer cents without float drift", () => {
    expect(parseDollarsToCents("500")).toBe(500_00);
    expect(parseDollarsToCents(" $1,250.5 ")).toBe(1_250_50);
    expect(parseDollarsToCents("0.07")).toBe(7);
    expect(parseDollarsToCents("19.99")).toBe(19_99);
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("12.345")).toBeNaN();
    expect(parseDollarsToCents("-5")).toBeNaN();
    expect(parseDollarsToCents("1e3")).toBeNaN();
  });

  it("averages a daily target to seven days", () => {
    expect(weeklyAverageCents(500_00)).toBe(3_500_00);
  });
});

describe("buildSubmission", () => {
  it("converts the observed defaults into the server payload", () => {
    const result = buildSubmission({ ...initialCampaignFormState(), name: "Launch", hashtag: "Launch" });
    expect(result).toEqual({
      ok: true,
      submission: {
        name: "Launch",
        primaryHashtag: "Launch",
        format: "slideshow",
        pricingMode: "daily",
        dailyBudgetCents: 500_00,
        cpmCapCents: null,
        targeting: { countries: [], platforms: [], ageMin: null, ageMax: null, gender: "any", metros: [], minCreatorLevel: "all" },
        approvals: { requireCreatorApproval: false, requireDedicatedAccount: false },
      },
    });
  });

  it("reports only input-shape problems, leaving business rules to the server", () => {
    const result = buildSubmission({ ...initialCampaignFormState(), dailyBudget: "", cpmCap: "abc", ageMin: "eighteen", ageMax: "34" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual(["cpmCapCents", "dailyBudgetCents", "targeting.ageMin"]);
    // A $10 budget parses fine; the $50 minimum is enforced by the server.
    expect(buildSubmission({ ...initialCampaignFormState(), dailyBudget: "10" }).ok).toBe(true);
  });

  it("tracks unsaved changes", () => {
    const initial = initialCampaignFormState();
    expect(isFormDirty(initialCampaignFormState(), initial)).toBe(false);
    expect(isFormDirty({ ...initial, countries: ["US"] }, initial)).toBe(true);
  });
});

describe("error mapping", () => {
  it("maps error keys (including nested array paths) to sections", () => {
    expect(sectionForErrorKey("name")).toBe("details");
    expect(sectionForErrorKey("format")).toBe("content");
    expect(sectionForErrorKey("cpmCapCents")).toBe("budget");
    expect(sectionForErrorKey("targeting.countries.2")).toBe("targeting");
    expect(sectionForErrorKey("approvals.requireDedicatedAccount")).toBe("approvals");
    expect(sectionForErrorKey("_form")).toBeNull();
  });

  it("normalizes nested keys and finds the first invalid field in on-screen order", () => {
    const errors = normalizeFieldErrors({
      "approvals.requireCreatorApproval": "Requires the Unlimited plan.",
      "targeting.countries.0": "Invalid",
      "targeting.countries.1": "Also invalid",
      dailyBudgetCents: "The minimum daily budget is $50.",
    });
    expect(errors).toEqual({
      "approvals.requireCreatorApproval": "Requires the Unlimited plan.",
      "targeting.countries": "Invalid",
      dailyBudgetCents: "The minimum daily budget is $50.",
    });
    expect(firstInvalidField(errors)).toEqual({ section: "budget", fieldId: "budget-amount", key: "dailyBudgetCents" });
    expect([...sectionsWithErrors(errors)].sort()).toEqual(["approvals", "budget", "targeting"]);
    expect(firstInvalidField({ _form: "Something" })).toBeNull();
  });
});

describe("section summaries", () => {
  it("shows the observed default summaries", () => {
    expect(sectionSummaries(initialCampaignFormState())).toEqual({
      details: { lines: ["Not set", "Not set"] },
      content: { lines: ["Slideshow"] },
      budget: { lines: ["$500 /day"] },
      targeting: { lines: ["All countries", "All platforms", "All creators"] },
      approvals: { lines: ["Creator approval not required", "Dedicated account not required"] },
    });
  });

  it("summarizes chosen values", () => {
    const summaries = sectionSummaries({
      ...initialCampaignFormState(),
      name: " Spring ",
      hashtag: "#tryAcme",
      format: "ugc",
      dailyBudget: "1250.5",
      cpmCap: "4",
      countries: ["US", "CA", "MX"],
      platforms: ["tiktok", "facebook_reels"],
      ageMin: "18",
      ageMax: "",
      gender: "female",
      metros: ["new-york"],
      minCreatorLevel: "gold",
      requireCreatorApproval: true,
    });
    expect(summaries.details.lines).toEqual(["Spring", "#tryAcme"]);
    expect(summaries.content.lines).toEqual(["UGC"]);
    expect(summaries.budget.lines).toEqual(["$1,250.50 /day", "CPM cap $4.00"]);
    expect(summaries.targeting.lines).toEqual(["3 countries", "TikTok, Facebook Reels", "Gold+", "Ages 18+ · Female · New York"]);
    expect(summaries.approvals.lines).toEqual(["Creator approval required", "Dedicated account not required"]);
  });
});

describe("hashtag suggestions", () => {
  it("derives try/join/App tags from the org name", () => {
    expect(hashtagBase("Pip's Pops")).toBe("PipsPops");
    expect(hashtagBase("café crème co.")).toBe("CafeCremeCo");
    expect(suggestHashtags("Acme")).toEqual(["tryAcme", "joinAcme", "AcmeApp"]);
    expect(hashtagPlaceholder("Pip's Pops")).toBe("pipspops");
  });

  it("returns no suggestions for names without usable characters and keeps tags within 50 characters", () => {
    expect(suggestHashtags("東京")).toEqual([]);
    expect(hashtagPlaceholder("東京")).toBe("yourbrand");
    for (const tag of suggestHashtags("A".repeat(80))) expect(tag.length).toBeLessThanOrEqual(50);
  });

  it("names the campaign placeholder after the chosen format", () => {
    expect(campaignNamePlaceholder("Acme", "ugc")).toBe("Acme UGC");
    expect(campaignNamePlaceholder("Acme", "slideshow")).toBe("Acme Slideshow");
  });
});

describe("forecastReasonText", () => {
  it("drops a repeated lead-in from the forecast reason", () => {
    expect(forecastReasonText("Reach estimate unavailable — no forecasting model has been configured for this workspace yet.")).toBe(
      "No forecasting model has been configured for this workspace yet.",
    );
    expect(forecastReasonText("Model offline.")).toBe("Model offline.");
  });
});
