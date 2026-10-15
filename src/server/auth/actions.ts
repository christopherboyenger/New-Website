"use server";

/**
 * Auth Server Actions for the sign-in, sign-up, verification and reset
 * pages. They wrap ./service.ts, return ActionResult values for
 * `useActionState` forms (echoing non-secret fields so a failed form keeps
 * its input), and redirect on success. `signOutAction` is part of the stable
 * interface used by the workspace shell.
 */
import { redirect } from "next/navigation";
import { fail, ok, runAction, type ActionResult } from "../action-result";
import { emailProviderConfigured, type EmailDeliveryStatus } from "../email";
import { consumeRateLimit } from "../rate-limit";
import { requestPasswordReset, resetPassword, sendVerificationEmail, signIn, signUp, verifyEmailToken } from "./service";
import { destroyCurrentSession, getCurrentSession, isSafeReturnPath } from "./session";

/** Result of an auth form, plus the non-secret values to show again after a failure. */
export type AuthFormState<T = undefined> = ActionResult<T> & { values?: Record<string, string> };

export async function signOutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/auth/sign-in");
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function safeNext(formData: FormData, fallback: string): string {
  const next = field(formData, "next");
  return next && isSafeReturnPath(next) ? next : fallback;
}

function requiredFields(entries: Array<[string, string, string]>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, value, message] of entries) if (!value.trim()) errors[name] = message;
  return errors;
}

/** Email + password sign-in. Honors only same-origin `next` paths; defaults to /home. */
export async function signInAction(_prev: AuthFormState | null, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const password = field(formData, "password");
  const values = { email };
  const result = await runAction(async (): Promise<ActionResult> => {
    const missing = requiredFields([
      ["email", email, "Enter your email address."],
      ["password", password, "Enter your password."],
    ]);
    if (Object.keys(missing).length) return fail("Enter your email and password.", "validation", missing);
    const outcome = await signIn(email, password);
    if (!outcome.ok) return fail(outcome.error, /too many/i.test(outcome.error) ? "rate_limited" : "validation");
    redirect(safeNext(formData, "/home"));
  });
  return { ...result, values };
}

/** Creates an account and signs it in, then continues to `next` (default: onboarding). */
export async function signUpAction(_prev: AuthFormState | null, formData: FormData): Promise<AuthFormState> {
  const values = {
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    email: field(formData, "email"),
  };
  const result = await runAction(async (): Promise<ActionResult> => {
    const outcome = await signUp({ ...values, password: field(formData, "password") });
    if (!outcome.ok) {
      const code = /too many/i.test(outcome.error) ? "rate_limited" : "validation";
      return fail(outcome.error, code, outcome.fieldErrors);
    }
    redirect(safeNext(formData, "/onboarding"));
  });
  return { ...result, values };
}

/** Consumes a one-time verification token (submitted explicitly, so link scanners cannot use it up). */
export async function confirmEmailAction(_prev: AuthFormState | null, formData: FormData): Promise<AuthFormState> {
  return runAction(async () => {
    const token = field(formData, "token");
    if (!token) return fail("This verification link is incomplete. Open the link from your email again.");
    const outcome = await verifyEmailToken(token);
    if (!outcome.ok) return fail(outcome.error, "not_found");
    return ok(undefined, "Your email address is verified.");
  });
}

export interface ResendResult {
  email: string;
  delivery: EmailDeliveryStatus;
}

/** Sends a new verification link to the signed-in user and reports the real delivery status. */
export async function resendVerificationAction(_prev: AuthFormState<ResendResult> | null): Promise<AuthFormState<ResendResult>> {
  void _prev;
  return runAction(async () => {
    const current = await getCurrentSession();
    if (!current) return fail("Sign in to verify your email address.", "forbidden");
    if (current.user.emailVerifiedAt) return fail("Your email address is already verified.", "conflict");
    const limit = await consumeRateLimit(`verify:resend:${current.user.id}`, 3, 60 * 60);
    if (!limit.allowed) {
      const minutes = Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 60_000));
      return fail(`You’ve requested several verification emails. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`, "rate_limited");
    }
    const delivery = await sendVerificationEmail(current.user.id, current.user.email);
    return ok({ email: current.user.email, delivery });
  });
}

export interface ResetRequestResult {
  /** Whether this deployment can deliver email at all (says nothing about the account). */
  emailDeliveryConfigured: boolean;
}

/** Always answers neutrally: the response never reveals whether an account exists. */
export async function requestPasswordResetAction(_prev: AuthFormState<ResetRequestResult> | null, formData: FormData): Promise<AuthFormState<ResetRequestResult>> {
  const email = field(formData, "email").trim();
  const result = await runAction(async (): Promise<ActionResult<ResetRequestResult>> => {
    if (!email) return fail("Enter your email address.", "validation", { email: "Enter your email address." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return fail("Enter a valid email address.", "validation", { email: "Enter a valid email address." });
    }
    await requestPasswordReset(email);
    return ok({ emailDeliveryConfigured: emailProviderConfigured() });
  });
  return { ...result, values: { email } };
}

/** Sets a new password from a reset link, then signs the user in and opens their workspace. */
export async function resetPasswordAction(_prev: AuthFormState | null, formData: FormData): Promise<AuthFormState> {
  return runAction(async (): Promise<ActionResult> => {
    const token = field(formData, "token");
    if (!token) return fail("This reset link is incomplete. Request a new one.", "not_found");
    const outcome = await resetPassword(token, field(formData, "password"));
    if (!outcome.ok) return fail(outcome.error, outcome.fieldErrors ? "validation" : "not_found", outcome.fieldErrors);
    redirect("/home");
  });
}
