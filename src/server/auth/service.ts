import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/ids";
import { site } from "@/config/site";
import { generateToken, tokenDigest } from "../crypto";
import { getDb } from "../db/client";
import { emailTokens, users } from "../db/schema";
import { absoluteUrl, sendEmail, type EmailDeliveryStatus } from "../email";
import { consumeRateLimit } from "../rate-limit";
import { recordAudit } from "../audit";
import { dummyPasswordHash, hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";
import { createSession, revokeAllSessionsForUser } from "./session";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, "That password is too long.");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1, "Enter your first name.").max(80),
  lastName: z.string().trim().max(80).default(""),
});

export type AuthResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export async function signUp(input: z.input<typeof signUpSchema>): Promise<AuthResult<{ userId: string; verificationEmail: EmailDeliveryStatus }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenErrors(parsed.error) };
  const { email, password, firstName, lastName } = parsed.data;

  const limit = await consumeRateLimit(`signup:email:${email}`, 5, 60 * 60);
  if (!limit.allowed) return { ok: false, error: "Too many attempts. Try again later." };

  const db = await getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) {
    return { ok: false, error: "An account with this email already exists. Sign in instead.", fieldErrors: { email: "Already registered." } };
  }
  const userId = newId("usr");
  await db.insert(users).values({ id: userId, email, passwordHash: await hashPassword(password), firstName, lastName });
  await recordAudit({ orgId: null, actorUserId: userId, action: "user.sign_up" });
  await createSession(userId);
  const verificationEmail = await sendVerificationEmail(userId, email);
  return { ok: true, value: { userId, verificationEmail } };
}

export async function signIn(emailInput: string, password: string): Promise<AuthResult<{ userId: string }>> {
  const email = emailSchema.safeParse(emailInput);
  if (!email.success) return { ok: false, error: "Incorrect email or password." };

  const limit = await consumeRateLimit(`login:email:${email.data}`, 10, 15 * 60);
  if (!limit.allowed) return { ok: false, error: "Too many sign-in attempts. Wait 15 minutes and try again." };

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.data)).limit(1);
  if (!user || user.disabledAt) {
    await verifyPassword(password, await dummyPasswordHash());
    return { ok: false, error: "Incorrect email or password." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) return { ok: false, error: "Incorrect email or password." };
  await createSession(user.id);
  return { ok: true, value: { userId: user.id } };
}

export async function sendVerificationEmail(userId: string, email: string): Promise<EmailDeliveryStatus> {
  const db = await getDb();
  const token = generateToken();
  await db.insert(emailTokens).values({
    id: newId("tok"),
    userId,
    purpose: "verify_email",
    tokenDigest: tokenDigest(token, "verify_email"),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  const link = absoluteUrl(`/auth/verify?token=${encodeURIComponent(token)}`);
  const result = await sendEmail({
    to: email,
    template: "verify_email",
    subject: `Verify your email for ${site.name}`,
    body: `Confirm your email address by opening this link within 48 hours:\n\n${link}\n\nIf you did not create an account, ignore this message.`,
  });
  return result.status;
}

export async function verifyEmailToken(token: string): Promise<AuthResult<{ userId: string }>> {
  const db = await getDb();
  const digest = tokenDigest(token, "verify_email");
  const now = new Date();
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenDigest, digest), eq(emailTokens.purpose, "verify_email"), isNull(emailTokens.consumedAt), gt(emailTokens.expiresAt, now)))
    .limit(1);
  if (!row) return { ok: false, error: "This verification link is invalid or has expired." };
  // Conditional claim: concurrent submissions of the same link cannot both succeed.
  const claimed = await db.transaction(async (tx) => {
    const [claim] = await tx
      .update(emailTokens)
      .set({ consumedAt: now })
      .where(and(eq(emailTokens.id, row.id), isNull(emailTokens.consumedAt)))
      .returning({ id: emailTokens.id });
    if (!claim) return false;
    await tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, row.userId));
    return true;
  });
  if (!claimed) return { ok: false, error: "This verification link is invalid or has expired." };
  return { ok: true, value: { userId: row.userId } };
}

/** Always reports success to the caller so account existence is not revealed. */
export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = emailSchema.safeParse(emailInput);
  if (!email.success) return;
  const limit = await consumeRateLimit(`reset:email:${email.data}`, 5, 60 * 60);
  if (!limit.allowed) return;
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.data)).limit(1);
  if (!user || user.disabledAt) return;
  const token = generateToken();
  await db.insert(emailTokens).values({
    id: newId("tok"),
    userId: user.id,
    purpose: "reset_password",
    tokenDigest: tokenDigest(token, "reset_password"),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  const link = absoluteUrl(`/auth/reset?token=${encodeURIComponent(token)}`);
  await sendEmail({
    to: user.email,
    template: "reset_password",
    subject: `Reset your ${site.name} password`,
    body: `Reset your password within one hour using this link:\n\n${link}\n\nIf you did not request this, you can ignore this message.`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<AuthResult> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid password.", fieldErrors: { password: parsed.error.issues[0]?.message ?? "" } };
  const db = await getDb();
  const now = new Date();
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenDigest, tokenDigest(token, "reset_password")), eq(emailTokens.purpose, "reset_password"), isNull(emailTokens.consumedAt), gt(emailTokens.expiresAt, now)))
    .limit(1);
  if (!row) return { ok: false, error: "This reset link is invalid or has expired." };
  const passwordHash = await hashPassword(parsed.data);
  const claimed = await db.transaction(async (tx) => {
    // Conditional claim: a link used concurrently resets the password at most once.
    const [claim] = await tx
      .update(emailTokens)
      .set({ consumedAt: now })
      .where(and(eq(emailTokens.id, row.id), isNull(emailTokens.consumedAt)))
      .returning({ id: emailTokens.id });
    if (!claim) return false;
    // Any other outstanding reset link for this account stops working too.
    await tx
      .update(emailTokens)
      .set({ consumedAt: now })
      .where(and(eq(emailTokens.userId, row.userId), eq(emailTokens.purpose, "reset_password"), isNull(emailTokens.consumedAt)));
    await tx.update(users).set({ passwordHash, emailVerifiedAt: now }).where(eq(users.id, row.userId));
    return true;
  });
  if (!claimed) return { ok: false, error: "This reset link is invalid or has expired." };
  await revokeAllSessionsForUser(row.userId);
  await recordAudit({ orgId: null, actorUserId: row.userId, action: "user.password_reset" });
  await createSession(row.userId);
  return { ok: true, value: undefined };
}

/** Re-checks the password for step-up on sensitive actions. */
export async function confirmPassword(userId: string, password: string): Promise<boolean> {
  const limit = await consumeRateLimit(`reauth:user:${userId}`, 10, 15 * 60);
  if (!limit.allowed) return false;
  const db = await getDb();
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(user) && (await verifyPassword(password, user.passwordHash));
}

export function flattenErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
