import { describe, expect, it } from "vitest";
import { commercialPolicy } from "@/config/commercial-policy";
import {
  billingThresholdOptions,
  BUDGET_MAX_CENTS,
  BUDGET_MIN_CENTS,
  campaignNameFor,
  classifyBrandLink,
  firstIncompleteStep,
  hashtagBaseFor,
  hashtagCandidate,
  isWebsiteOrStoreLink,
  mergeStepAnswers,
  nextStepKey,
  onboardingStepKeys,
  parseAnswers,
  pickStepAnswers,
  previousStepKey,
  reconcileAnswers,
  referencePositions,
  resumeStep,
  stepNumber,
  TOTAL_STEPS,
  validateStep,
  withDisplayDefaults,
  type OnboardingAnswers,
} from "./onboarding";
import { isValidHashtag } from "./campaign";

const complete: OnboardingAnswers = {
  role: "founder",
  referralSource: "podcast",
  brandName: "Juniper & Co.",
  brandWebsite: "juniper.example",
  brandDescription: "Refillable home cleaning kits.",
  dailyBudgetCents: 120_00,
  format: "ugc",
  templateId: "ugc-greenscreen",
  billingThresholdCents: 25_00,
};

describe("onboarding step machine", () => {
  it("orders the implemented screens and omits reference position 5 (DEC-014)", () => {
    expect(onboardingStepKeys).toEqual(["role", "overview", "referral", "brand", "budget", "summary", "format", "template", "billing", "payment"]);
    expect(TOTAL_STEPS).toBe(10);
    expect(Object.values(referencePositions)).not.toContain(5);
    expect(referencePositions.payment).toBe(11);
    expect(stepNumber("role")).toBe(1);
    expect(stepNumber("payment")).toBe(10);
  });

  it("moves forward and back one screen at a time", () => {
    expect(nextStepKey("role")).toBe("overview");
    expect(nextStepKey("brand")).toBe("budget");
    expect(nextStepKey("payment")).toBe("payment");
    expect(previousStepKey("budget")).toBe("brand");
    expect(previousStepKey("role")).toBeNull();
  });

  it("resumes at the furthest screen reached, but never past an incomplete one", () => {
    expect(resumeStep(null, {})).toBe("role");
    expect(resumeStep("template", complete)).toBe("template");
    const { templateId: _dropped, ...withoutTemplate } = complete;
    void _dropped;
    expect(resumeStep("payment", withoutTemplate)).toBe("template");
    expect(resumeStep("overview", { role: "creator" })).toBe("overview");
    expect(firstIncompleteStep({ role: "creator" })).toBe("referral");
    expect(firstIncompleteStep(complete)).toBe("payment");
  });
});

describe("onboarding validation per screen", () => {
  it("requires a role from the observed set", () => {
    expect(validateStep("role", {}).valid).toBe(false);
    expect(validateStep("role", {}).reason).toBe("Choose the option that best describes you.");
    expect(validateStep("role", { role: "operations" }).valid).toBe(true);
    expect(parseAnswers({ role: "investor" })).toEqual({});
  });

  it("requires a code only for “I have a code” and keeps Other detail optional", () => {
    expect(validateStep("referral", {}).valid).toBe(false);
    const missingCode = validateStep("referral", { referralSource: "code" });
    expect(missingCode.valid).toBe(false);
    expect(missingCode.fieldErrors.referralCode).toBe("Enter your code to continue.");
    expect(validateStep("referral", { referralSource: "code", referralCode: "bad code!" }).fieldErrors.referralCode).toMatch(/letters, numbers/);
    expect(validateStep("referral", { referralSource: "code", referralCode: " SPRING-26 " }).values).toEqual({ referralSource: "code", referralCode: "SPRING-26" });
    expect(validateStep("referral", { referralSource: "other" }).valid).toBe(true);
    expect(validateStep("referral", { referralSource: "other", referralDetail: "A friend" }).values.referralDetail).toBe("A friend");
    // Irrelevant follow-up answers are dropped when the source changes.
    expect(validateStep("referral", { referralSource: "tiktok", referralCode: "X1" }).values).toEqual({ referralSource: "tiktok" });
  });

  it("requires brand name, a website or store link, and a description within limits", () => {
    const empty = validateStep("brand", {});
    expect(empty.valid).toBe(false);
    expect(Object.keys(empty.fieldErrors).sort()).toEqual(["brandDescription", "brandName", "brandWebsite"]);
    expect(empty.reason).toMatch(/brand name, website and description/);

    const base = { brandName: "  Juniper  ", brandWebsite: "juniper.example", brandDescription: "Home cleaning kits" };
    const ok = validateStep("brand", base);
    expect(ok.valid).toBe(true);
    expect(ok.values.brandName).toBe("Juniper");

    expect(validateStep("brand", { ...base, brandWebsite: "not a site" }).fieldErrors.brandWebsite).toMatch(/website or App Store link/);
    expect(validateStep("brand", { ...base, brandWebsite: "https://apps.apple.com/us/app/example/id123" }).valid).toBe(true);
    expect(validateStep("brand", { ...base, brandName: "x".repeat(81) }).fieldErrors.brandName).toMatch(/80 characters/);
    expect(validateStep("brand", { ...base, brandDescription: "x".repeat(501) }).fieldErrors.brandDescription).toMatch(/500/);
    expect(validateStep("brand", { ...base, brandDescription: "   " }).valid).toBe(false);
  });

  it("accepts whole-dollar daily budgets between $50 and $5,000", () => {
    expect(validateStep("budget", { dailyBudgetCents: BUDGET_MIN_CENTS }).valid).toBe(true);
    expect(validateStep("budget", { dailyBudgetCents: BUDGET_MAX_CENTS }).valid).toBe(true);
    expect(validateStep("budget", { dailyBudgetCents: BUDGET_MIN_CENTS - 100 }).reason).toBe("Choose a daily budget between $50 and $5,000.");
    expect(validateStep("budget", { dailyBudgetCents: BUDGET_MAX_CENTS + 100 }).valid).toBe(false);
    expect(validateStep("budget", { dailyBudgetCents: 75_50 }).reason).toBe("Use a whole-dollar amount.");
    expect(validateStep("budget", {}).valid).toBe(false);
  });

  it("requires a template compatible with the chosen format", () => {
    expect(validateStep("template", { templateId: "ugc-greenscreen" }).reason).toBe("Choose a content format first.");
    expect(validateStep("template", { format: "slideshow", templateId: "ugc-greenscreen" }).valid).toBe(false);
    expect(validateStep("template", { format: "ugc", templateId: "ugc-greenscreen" }).valid).toBe(true);
    expect(validateStep("template", { format: "ugc", templateId: "no-such-template" }).valid).toBe(false);
  });

  it("offers only the billing thresholds in the commercial policy", () => {
    expect(billingThresholdOptions().map((o) => o.cents)).toEqual([...commercialPolicy.billingThresholdOptionsCents]);
    expect(billingThresholdOptions()[0].description).toBe("Get charged in small, frequent amounts");
    expect(validateStep("billing", { billingThresholdCents: 25_00 }).valid).toBe(true);
    expect(validateStep("billing", { billingThresholdCents: 30_00 }).valid).toBe(false);
  });

  it("treats screens without inputs as always complete", () => {
    for (const step of ["overview", "summary", "payment"] as const) expect(validateStep(step, {}).valid).toBe(true);
  });
});

describe("onboarding answers", () => {
  it("keeps a compatible template and clears an incompatible one when the format changes (never converts)", () => {
    expect(reconcileAnswers({ format: "ugc", templateId: "ugc-skit" }).templateId).toBe("ugc-skit");
    expect(reconcileAnswers({ format: "slideshow", templateId: "ugc-skit" }).templateId).toBeUndefined();
    const switched = mergeStepAnswers(complete, "format", { format: "slideshow" });
    expect(switched.format).toBe("slideshow");
    expect(switched.templateId).toBeUndefined();
    expect(firstIncompleteStep(switched)).toBe("template");
  });

  it("only accepts the fields a screen owns from untrusted input", () => {
    expect(pickStepAnswers("role", { role: "founder", brandName: "Injected", orgId: "org_x" })).toEqual({ role: "founder" });
    const merged = mergeStepAnswers(complete, "referral", { referralSource: "google_search" });
    expect(merged.brandName).toBe(complete.brandName);
    expect(merged.referralSource).toBe("google_search");
  });

  it("fills display defaults without treating them as answers", () => {
    const shown = withDisplayDefaults({});
    expect(shown.dailyBudgetCents).toBe(BUDGET_MIN_CENTS);
    expect(shown.billingThresholdCents).toBe(commercialPolicy.defaultBillingThresholdCents);
    expect(firstIncompleteStep({ ...complete, dailyBudgetCents: undefined })).toBe("budget");
  });

  it("parses stored answers leniently", () => {
    expect(parseAnswers(null)).toEqual({});
    expect(parseAnswers({ dailyBudgetCents: "100", format: "video", brandName: "Ok" })).toEqual({ brandName: "Ok" });
  });
});

describe("onboarding completion values", () => {
  it("names the starter campaign after the brand and format", () => {
    expect(campaignNameFor("Juniper & Co.", "ugc")).toBe("Juniper & Co. UGC");
    expect(campaignNameFor("Juniper", "slideshow")).toBe("Juniper Slideshow");
  });

  it("derives valid, distinct hashtag candidates from the brand name", () => {
    expect(hashtagBaseFor("Juniper & Co.")).toBe("juniperco");
    expect(hashtagBaseFor("Café Olé")).toBe("cafeole");
    expect(hashtagBaseFor("Ω")).toBe("brand");
    expect(hashtagBaseFor("X")).toBe("xbrand");
    expect(hashtagCandidate("juniperco", 0)).toBe("juniperco");
    expect(hashtagCandidate("juniperco", 1)).toBe("juniperco2");
    for (const name of ["Juniper & Co.", "Café Olé", "Ω", "a".repeat(80)]) {
      expect(isValidHashtag(hashtagCandidate(hashtagBaseFor(name), 24))).toBe(true);
    }
  });

  it("classifies website, App Store and Google Play links like workspace creation", () => {
    expect(classifyBrandLink("juniper.example")).toEqual({ websiteUrl: "https://juniper.example", appStoreUrl: null, playStoreUrl: null });
    expect(classifyBrandLink("https://apps.apple.com/app/id1")).toEqual({ websiteUrl: null, appStoreUrl: "https://apps.apple.com/app/id1", playStoreUrl: null });
    expect(classifyBrandLink("play.google.com/store/apps/details?id=x")).toEqual({
      websiteUrl: null,
      appStoreUrl: null,
      playStoreUrl: "https://play.google.com/store/apps/details?id=x",
    });
    expect(isWebsiteOrStoreLink("localhost")).toBe(false);
    expect(isWebsiteOrStoreLink("javascript:alert(1)")).toBe(false);
  });
});
