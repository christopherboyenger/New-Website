import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/support/db";
import { resetRequestContext, signInAs } from "../../../tests/support/request-context";
import { makeUser } from "../../../tests/support/factories";
import { getDb } from "../db/client";
import { emailOutbox, users } from "../db/schema";
import {
  confirmEmailAction,
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "./actions";
import { getCurrentSession } from "./session";
import { signUp } from "./service";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/** Runs an action that should redirect and returns the redirect target (Next throws a NEXT_REDIRECT control-flow error). */
async function redirectTarget(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return digest.split(";").slice(2, -2).join(";");
    throw error;
  }
  throw new Error("expected a redirect");
}

function tokenFrom(body: string): string {
  const match = /token=([^\s&]+)/.exec(body);
  if (!match) throw new Error("no token in email body");
  return decodeURIComponent(match[1]);
}

const password = "a long enough password";

describe("auth actions", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
    await signUp({ email: "owner@example.test", password, firstName: "Ada" });
    resetRequestContext();
  });

  it("signs in and honors only same-origin next paths", async () => {
    expect(await redirectTarget(signInAction(null, form({ email: "owner@example.test", password, next: "/onboarding?new=1" })))).toBe("/onboarding?new=1");
    expect(await getCurrentSession()).not.toBeNull();
    for (const next of ["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", ""]) {
      resetRequestContext();
      expect(await redirectTarget(signInAction(null, form({ email: "owner@example.test", password, next })))).toBe("/home");
    }
  });

  it("returns a generic error for bad credentials and keeps the email but never the password", async () => {
    const result = await signInAction(null, form({ email: "owner@example.test", password: "wrong password!!" }));
    expect(result).toMatchObject({ ok: false, error: "Incorrect email or password.", values: { email: "owner@example.test" } });
    expect(JSON.stringify(result)).not.toContain("wrong password");
    const missing = await signInAction(null, form({ email: "", password: "" }));
    expect(missing).toMatchObject({ ok: false, fieldErrors: { email: "Enter your email address.", password: "Enter your password." } });
    expect(await getCurrentSession()).toBeNull();
  });

  it("surfaces the sign-in rate limit", async () => {
    for (let i = 0; i < 10; i++) await signInAction(null, form({ email: "owner@example.test", password: "wrong password!!" }));
    const limited = await signInAction(null, form({ email: "owner@example.test", password }));
    expect(limited).toMatchObject({ ok: false, code: "rate_limited", error: expect.stringMatching(/Too many/) });
  });

  it("validates sign-up fields and reports them per field", async () => {
    const result = await signUpAction(null, form({ firstName: "", lastName: "Lovelace", email: "not-an-email", password: "short" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors).toMatchObject({
      firstName: "Enter your first name.",
      email: "Enter a valid email address.",
      password: expect.stringMatching(/at least 10 characters/),
    });
    expect(result.values).toEqual({ firstName: "", lastName: "Lovelace", email: "not-an-email" });
    const taken = await signUpAction(null, form({ firstName: "Ada", lastName: "", email: "owner@example.test", password }));
    expect(taken).toMatchObject({ ok: false, fieldErrors: { email: "Already registered." } });
  });

  it("creates the account, signs it in and continues to onboarding or a safe next path", async () => {
    expect(await redirectTarget(signUpAction(null, form({ firstName: "Grace", lastName: "Hopper", email: "grace@example.test", password })))).toBe("/onboarding");
    const session = await getCurrentSession();
    expect(session?.user).toMatchObject({ email: "grace@example.test", firstName: "Grace", lastName: "Hopper" });
    resetRequestContext();
    expect(
      await redirectTarget(signUpAction(null, form({ firstName: "Lin", lastName: "", email: "lin@example.test", password, next: "https://evil.example" }))),
    ).toBe("/onboarding");
  });

  it("verifies email with an explicitly submitted token", async () => {
    const db = await getDb();
    const [mail] = await db.select().from(emailOutbox).where(eq(emailOutbox.template, "verify_email"));
    expect((await confirmEmailAction(null, form({ token: tokenFrom(mail.body) }))).ok).toBe(true);
    expect((await confirmEmailAction(null, form({ token: tokenFrom(mail.body) }))).ok).toBe(false);
    expect((await confirmEmailAction(null, form({}))).ok).toBe(false);
    const [user] = await db.select().from(users).where(eq(users.email, "owner@example.test"));
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("resends verification only to signed-in unverified users and reports the real delivery status", async () => {
    expect(await resendVerificationAction(null)).toMatchObject({ ok: false, code: "forbidden" });
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, "owner@example.test"));
    await signInAs(user.id);
    const sent = await resendVerificationAction(null);
    expect(sent).toMatchObject({ ok: true, data: { email: "owner@example.test", delivery: "provider_unconfigured" } });
    await resendVerificationAction(null);
    await resendVerificationAction(null);
    expect(await resendVerificationAction(null)).toMatchObject({ ok: false, code: "rate_limited" });

    const verified = await makeUser();
    await signInAs(verified.id);
    expect(await resendVerificationAction(null)).toMatchObject({ ok: false, code: "conflict" });
  });

  it("answers reset requests the same way whether or not the account exists", async () => {
    const known = await requestPasswordResetAction(null, form({ email: "owner@example.test" }));
    const unknown = await requestPasswordResetAction(null, form({ email: "nobody@example.test" }));
    expect(known).toEqual({ ok: true, data: { emailDeliveryConfigured: false }, message: undefined, values: { email: "owner@example.test" } });
    expect(unknown).toEqual({ ...known, values: { email: "nobody@example.test" } });
    expect(await requestPasswordResetAction(null, form({ email: "nope" }))).toMatchObject({ ok: false, fieldErrors: { email: "Enter a valid email address." } });
  });

  it("sets a new password from a reset link and signs in", async () => {
    await requestPasswordResetAction(null, form({ email: "owner@example.test" }));
    const db = await getDb();
    const [mail] = await db.select().from(emailOutbox).where(eq(emailOutbox.template, "reset_password"));
    const token = tokenFrom(mail.body);
    expect(await resetPasswordAction(null, form({ token, password: "short" }))).toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });
    expect(await redirectTarget(resetPasswordAction(null, form({ token, password: "a brand new password" })))).toBe("/home");
    expect(await getCurrentSession()).not.toBeNull();
    expect(await resetPasswordAction(null, form({ token, password: "another new password" }))).toMatchObject({ ok: false, code: "not_found" });
  });
});
