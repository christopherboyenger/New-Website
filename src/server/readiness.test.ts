import { afterEach, describe, expect, it } from "vitest";
import { resetEnvForTesting } from "./env";
import { capability } from "./readiness";

const keys = ["META_APP_ID", "META_APP_SECRET", "TIKTOK_BUSINESS_APP_ID", "TIKTOK_BUSINESS_APP_SECRET"] as const;
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof keys)[number], string>>) {
  for (const k of keys) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
  resetEnvForTesting();
}

afterEach(() => {
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetEnvForTesting();
});

describe("capability readiness details", () => {
  it("never describes half-configured ad app credentials as configured", () => {
    setEnv({ META_APP_ID: "app", TIKTOK_BUSINESS_APP_ID: "app" });
    for (const key of ["meta_ads", "tiktok_ads"] as const) {
      const state = capability(key);
      expect(state.configured).toBe(false);
      expect(state.detail).not.toMatch(/credentials configured/i);
    }
  });

  it("reports ad apps as configured only with both the ID and the secret", () => {
    setEnv({ META_APP_ID: "app", META_APP_SECRET: "secret", TIKTOK_BUSINESS_APP_ID: "app", TIKTOK_BUSINESS_APP_SECRET: "secret" });
    expect(capability("meta_ads")).toMatchObject({ configured: true, detail: expect.stringMatching(/credentials configured/i) });
    expect(capability("tiktok_ads")).toMatchObject({ configured: true, detail: expect.stringMatching(/credentials configured/i) });
  });
});
