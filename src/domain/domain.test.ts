import { describe, expect, it } from "vitest";
import { addDays, formatRangeLabel, matchPreset, normalizeRange, presetRange, rangeLengthDays, validateRange } from "./date-range";
import { can, canManageTeammate, grantableRoles } from "./permissions";
import { gatedFeaturesUsed, hasFeature, missingEntitlements } from "./entitlements";
import { defaultApprovals, defaultTargeting } from "./campaign";
import { aggregateMetrics, counterDelta, cpmUsd, engagementRate } from "./reporting-math";
import { templatesForFormat } from "./playbook-templates";

const now = new Date("2026-10-14T15:00:00Z");

describe("date ranges (UTC)", () => {
  it("matches the observed 30-day default Sep 15 – Oct 14", () => {
    const r = presetRange("last_30_days", now);
    expect(r).toEqual({ from: "2026-09-15", to: "2026-10-14" });
    expect(rangeLengthDays(r)).toBe(30);
    expect(formatRangeLabel(r)).toBe("Sep 15, 2026 - Oct 14, 2026");
    expect(matchPreset(r, now)).toBe("last_30_days");
  });
  it("computes calendar presets", () => {
    expect(presetRange("last_month", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("this_month", now)).toEqual({ from: "2026-10-01", to: "2026-10-14" });
    expect(presetRange("year_to_date", now)).toEqual({ from: "2026-01-01", to: "2026-10-14" });
    expect(presetRange("last_month", new Date("2026-01-10T00:00:00Z"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("validates strictly and normalizes leniently", () => {
    expect(validateRange("2026-02-30", "2026-03-01").ok).toBe(false);
    expect(validateRange("2026-03-02", "2026-03-01").ok).toBe(false);
    expect(validateRange("2025-01-01", "2026-01-02").ok).toBe(false); // 367 days
    expect(validateRange("2025-01-02", "2026-01-02").ok).toBe(true); // 366 days
    expect(normalizeRange("garbage", "2026-01-01", now)).toEqual(presetRange("last_30_days", now));
    expect(normalizeRange("2026-03-05", "2026-03-01", now)).toEqual({ from: "2026-03-01", to: "2026-03-05" });
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("permissions", () => {
  const primary = { role: "owner" as const, isPrimaryOwner: true };
  const owner = { role: "owner" as const, isPrimaryOwner: false };
  const member = { role: "member" as const, isPrimaryOwner: false };
  it("keeps billing and campaign control away from members", () => {
    expect(can(member, "billing:view")).toBe(false);
    expect(can(member, "campaign:manage")).toBe(false);
    expect(can(member, "playbook:edit")).toBe(true);
    expect(can(owner, "billing:manage")).toBe(true);
  });
  it("only lets the primary owner transfer ownership", () => {
    expect(can(owner, "ownership:transfer")).toBe(false);
    expect(can(primary, "ownership:transfer")).toBe(true);
  });
  it("manages teammates only below the actor's own level", () => {
    expect(canManageTeammate(owner, member, false)).toBe(true);
    expect(canManageTeammate(owner, owner, false)).toBe(false);
    expect(canManageTeammate(primary, owner, false)).toBe(true);
    expect(canManageTeammate(primary, primary, true)).toBe(false);
    expect(canManageTeammate(member, member, false)).toBe(false);
    expect(grantableRoles(owner)).toEqual(["member"]);
  });
});

describe("entitlements", () => {
  const base = { pricingMode: "daily" as const, cpmCapCents: null, targeting: defaultTargeting, approvals: defaultApprovals };
  it("allows default settings on the basic plan", () => {
    expect(gatedFeaturesUsed(base)).toEqual([]);
  });
  it("flags every Unlimited-only setting", () => {
    const gated = {
      pricingMode: "manual" as const,
      cpmCapCents: 500,
      targeting: { ...defaultTargeting, gender: "female" as const, minCreatorLevel: "gold" as const },
      approvals: { requireCreatorApproval: true, requireDedicatedAccount: true },
    };
    expect(missingEntitlements("basic", gated)).toEqual([
      "manual_pricing",
      "cpm_cap",
      "demographic_targeting",
      "creator_level_targeting",
      "creator_approval",
      "dedicated_accounts",
    ]);
    expect(missingEntitlements("unlimited", gated)).toEqual([]);
    expect(hasFeature("basic", "creator_messaging")).toBe(false);
  });
});

describe("reporting math", () => {
  it("weights CPM by totals and treats zero views as not computable", () => {
    expect(cpmUsd(150, 1000)).toBeCloseTo(1.5);
    expect(cpmUsd(150, 0)).toBeNull();
    const agg = aggregateMetrics([
      { views: 1000, spendCents: 100, postId: "a", creatorId: "x" },
      { views: 1000, spendCents: 1000, postId: "b", creatorId: "x" },
    ]);
    expect(agg.cpmUsd).toBeCloseTo(5.5);
    expect(agg.creators).toBe(1);
    expect(agg.avgViewsPerPost).toBe(1000);
  });
  it("returns engagement as a fraction and never fabricates it", () => {
    expect(engagementRate({ likes: 5, comments: 3, bookmarks: 1, shares: 1, views: 100 })).toBeCloseTo(0.1);
    expect(engagementRate({ likes: null, comments: null, bookmarks: null, shares: null, views: 100 })).toBeNull();
    expect(engagementRate({ likes: 1, comments: 0, bookmarks: 0, shares: 0, views: null })).toBeNull();
  });
  it("never produces negative deltas from counter corrections", () => {
    expect(counterDelta(100, 90)).toBe(0);
    expect(counterDelta(100, 150)).toBe(50);
    expect(counterDelta(null, 150)).toBe(0);
  });
});

describe("templates", () => {
  it("declares a format for every template and offers both formats", () => {
    expect(templatesForFormat("ugc").map((t) => t.name)).toContain("Greenscreen");
    expect(templatesForFormat("slideshow").length).toBeGreaterThan(0);
    for (const t of templatesForFormat("ugc")) expect(t.content.kind).toBe("ugc");
  });
});
