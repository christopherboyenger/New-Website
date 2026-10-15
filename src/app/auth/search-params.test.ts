import { describe, expect, it } from "vitest";
import { emailParam, firstParam, safeNextParam, withNext } from "./search-params";

describe("auth page query parameters", () => {
  it("accepts only same-origin return paths outside /auth", () => {
    expect(safeNextParam("/onboarding?new=1")).toBe("/onboarding?new=1");
    expect(safeNextParam(["/home/acme", "/other"])).toBe("/home/acme");
    for (const unsafe of ["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "home", "", undefined]) {
      expect(safeNextParam(unsafe)).toBeNull();
    }
    for (const authPath of ["/auth", "/auth/sign-in", "/auth?x=1", "/auth/sign-up?next=%2Fhome"]) expect(safeNextParam(authPath)).toBeNull();
    expect(safeNextParam(`/${"a".repeat(2001)}`)).toBeNull();
  });

  it("uses an email prefill only as a bounded default value", () => {
    expect(emailParam(" grace@example.test ")).toBe("grace@example.test");
    expect(emailParam(`${"a".repeat(250)}@x.io`)).toBe("");
    expect(emailParam(undefined)).toBe("");
    expect(firstParam([])).toBeNull();
  });

  it("carries next between sign-in and sign-up", () => {
    expect(withNext("/auth/sign-up", "/onboarding?new=1")).toBe("/auth/sign-up?next=%2Fonboarding%3Fnew%3D1");
    expect(withNext("/auth/sign-in", null)).toBe("/auth/sign-in");
  });
});
