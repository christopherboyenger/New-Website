import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/support/db";
import { cookieJar, resetRequestContext } from "../../../tests/support/request-context";
import { makeOrg, makeUser } from "../../../tests/support/factories";
import { getDb } from "../db/client";
import { emailOutbox, users } from "../db/schema";
import { getCurrentSession, isSafeReturnPath, SESSION_COOKIE, destroyCurrentSession } from "./session";
import { requestPasswordReset, resetPassword, signIn, signUp, verifyEmailToken } from "./service";
import { loadOrgContext } from "../authz";
import { signInAs } from "../../../tests/support/request-context";

function linkToken(body: string): string {
  const match = /token=([^\s&]+)/.exec(body);
  if (!match) throw new Error("no token in email body");
  return decodeURIComponent(match[1]);
}

describe("authentication", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("signs up, stores only a password hash, starts a session and records an undelivered verification email", async () => {
    const result = await signUp({ email: "  Founder@Example.com ", password: "correct horse battery", firstName: "Ada" });
    expect(result.ok).toBe(true);
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, "founder@example.com"));
    expect(user.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(user.passwordHash).not.toContain("correct horse");
    expect(cookieJar.get(SESSION_COOKIE)).toBeTruthy();
    expect((await getCurrentSession())?.user.id).toBe(user.id);
    const [mail] = await db.select().from(emailOutbox);
    expect(mail.status).toBe("provider_unconfigured");
    expect(result.ok && result.value.verificationEmail).toBe("provider_unconfigured");
  });

  it("verifies email with a one-time token", async () => {
    await signUp({ email: "a@example.com", password: "long enough password", firstName: "A" });
    const db = await getDb();
    const [mail] = await db.select().from(emailOutbox);
    const token = linkToken(mail.body);
    expect((await verifyEmailToken(token)).ok).toBe(true);
    expect((await verifyEmailToken(token)).ok).toBe(false);
    const [user] = await db.select().from(users).where(eq(users.email, "a@example.com"));
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("rejects wrong passwords with a generic message and rate-limits repeated attempts", async () => {
    await signUp({ email: "b@example.com", password: "long enough password", firstName: "B" });
    resetRequestContext();
    const bad = await signIn("b@example.com", "wrong password!!");
    expect(bad).toEqual({ ok: false, error: "Incorrect email or password." });
    const unknown = await signIn("nobody@example.com", "whatever password");
    expect(unknown).toEqual({ ok: false, error: "Incorrect email or password." });
    for (let i = 0; i < 9; i++) await signIn("b@example.com", "wrong password!!");
    const limited = await signIn("b@example.com", "long enough password");
    expect(limited.ok).toBe(false);
    expect(!limited.ok && limited.error).toMatch(/Too many/);
  });

  it("resets a password, revoking existing sessions", async () => {
    await signUp({ email: "c@example.com", password: "original password", firstName: "C" });
    const oldCookie = cookieJar.get(SESSION_COOKIE)!;
    await requestPasswordReset("c@example.com");
    const db = await getDb();
    const mails = await db.select().from(emailOutbox);
    const reset = mails.find((m) => m.template === "reset_password")!;
    expect((await resetPassword(linkToken(reset.body), "brand new password")).ok).toBe(true);
    cookieJar.set(SESSION_COOKIE, oldCookie);
    expect(await getCurrentSession()).toBeNull();
    resetRequestContext();
    expect((await signIn("c@example.com", "brand new password")).ok).toBe(true);
  });

  it("lets a reset link work only once, even concurrently, and retires other outstanding reset links", async () => {
    await signUp({ email: "d@example.com", password: "original password", firstName: "D" });
    await requestPasswordReset("d@example.com");
    await requestPasswordReset("d@example.com");
    const db = await getDb();
    const tokens = (await db.select().from(emailOutbox))
      .filter((m) => m.template === "reset_password")
      .map((m) => linkToken(m.body));
    expect(tokens).toHaveLength(2);
    const [first, second] = await Promise.all([resetPassword(tokens[0], "first new password"), resetPassword(tokens[0], "second new password")]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    // The other link from before the reset no longer works.
    expect((await resetPassword(tokens[1], "attacker password!")).ok).toBe(false);
    resetRequestContext();
    expect((await signIn("d@example.com", "attacker password!")).ok).toBe(false);
  });

  it("consumes a verification link once even when submitted concurrently", async () => {
    await signUp({ email: "e@example.com", password: "long enough password", firstName: "E" });
    const db = await getDb();
    const [mail] = await db.select().from(emailOutbox);
    const token = linkToken(mail.body);
    const results = await Promise.all([verifyEmailToken(token), verifyEmailToken(token)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("signs out by revoking the session", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    expect(await getCurrentSession()).not.toBeNull();
    await destroyCurrentSession();
    expect(await getCurrentSession()).toBeNull();
  });

  it("resolves workspaces only for members (non-members get the same null as a missing slug)", async () => {
    const { org, owner } = await makeOrg({ slug: "mine" });
    const outsider = await makeUser();
    await signInAs(owner.id);
    expect((await loadOrgContext("mine"))?.org.id).toBe(org.id);
    await signInAs(outsider.id);
    expect(await loadOrgContext("mine")).toBeNull();
    expect(await loadOrgContext("does-not-exist")).toBeNull();
  });

  it("only accepts internal return paths", () => {
    expect(isSafeReturnPath("/home/acme?tab=posts")).toBe(true);
    expect(isSafeReturnPath("//evil.example")).toBe(false);
    expect(isSafeReturnPath("/\\evil.example")).toBe(false);
    expect(isSafeReturnPath("https://evil.example")).toBe(false);
  });
});
