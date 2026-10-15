import { describe, expect, it } from "vitest";
import { isLaunchReady, missingLaunchScopes } from "./ad-launch-readiness";

describe("ad launch readiness", () => {
  it("requires ads_management for Meta", () => {
    expect(missingLaunchScopes("meta_ads", ["ads_read"])).toEqual(["ads_management"]);
    expect(isLaunchReady({ provider: "meta_ads", status: "connected", grantedScopes: ["ads_read"] })).toBe(false);
    expect(isLaunchReady({ provider: "meta_ads", status: "connected", grantedScopes: ["ads_read", "ads_management"] })).toBe(true);
  });

  it("only treats status `connected` as launch-ready", () => {
    for (const status of ["verifying", "limited_permissions", "reauthorization_required", "error", "revocation_pending"]) {
      expect(isLaunchReady({ provider: "meta_ads", status, grantedScopes: ["ads_management"] })).toBe(false);
      expect(isLaunchReady({ provider: "tiktok_ads", status, grantedScopes: [] })).toBe(false);
    }
    expect(isLaunchReady({ provider: "tiktok_ads", status: "connected", grantedScopes: [] })).toBe(true);
  });
});
