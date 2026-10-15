import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/ids";
import { platformLabels, platforms, type Platform } from "@/domain/campaign";
import { isCountryCode } from "@/domain/targeting-catalog";
import { fail, fromZodError, ok, type ActionResult } from "../action-result";
import { recordAudit } from "../audit";
import { flattenErrors, signUp, signUpSchema } from "../auth/service";
import { getCurrentSession } from "../auth/session";
import { NotFoundError } from "../authz";
import { getDb } from "../db/client";
import { creators, posts, socialAccounts } from "../db/schema";
import { findCreatorForUser, requireCreatorAction, runCreatorAction, type CreatorContext } from "./context";

/**
 * Creator registration, profile and social accounts. Social accounts are
 * stored as "unverified": ownership verification needs a provider OAuth
 * connection this deployment does not have, so nothing here ever marks an
 * account verified (production-requirements.md §2: a user-entered handle is
 * insufficient proof of ownership).
 */

export const MAX_SOCIAL_ACCOUNTS = 10;

export const creatorProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter the name brands will see.").max(60, "Use 60 characters or fewer."),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => isCountryCode(v), "Choose the country you live in."),
});
export type CreatorProfileInput = z.input<typeof creatorProfileSchema>;

/** Handles are stored without '@', lowercased (platform handles are case-insensitive). */
export const handleSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@+/, "").toLowerCase())
  .pipe(z.string().min(1, "Enter your handle.").max(50, "Use 50 characters or fewer.").regex(/^[a-z0-9._-]+$/, "Use only letters, numbers, periods, underscores or hyphens."));

export const socialAccountSchema = z.object({
  platform: z.enum(platforms, { message: "Choose a platform." }),
  handle: handleSchema,
  dedicated: z.boolean().default(false),
});
/** Raw input; the platform is validated by the schema. */
export type SocialAccountInput = { platform: string; handle: string; dedicated?: boolean };

async function insertCreator(userId: string, profile: z.output<typeof creatorProfileSchema>) {
  const db = await getDb();
  const id = newId("crt");
  const [row] = await db
    .insert(creators)
    .values({ id, userId, displayName: profile.displayName, country: profile.country })
    .onConflictDoNothing({ target: creators.userId })
    .returning({ id: creators.id });
  if (!row) return null;
  await recordAudit({ orgId: null, actorUserId: userId, action: "creator.register", targetType: "creator", targetId: id });
  return row.id;
}

/**
 * New creator account: validates both the login and the profile first (so a
 * failure never leaves a half-created account), creates the user through the
 * shared auth service, then links the creator profile to it.
 */
export async function signUpCreator(input: z.input<typeof signUpSchema> & CreatorProfileInput): Promise<ActionResult<{ creatorId: string }>> {
  return runCreatorAction(async () => {
    const login = signUpSchema.safeParse(input);
    const profile = creatorProfileSchema.safeParse(input);
    if (!login.success || !profile.success) {
      return fail("Check the highlighted fields.", "validation", { ...(login.success ? {} : flattenErrors(login.error)), ...(profile.success ? {} : flattenErrors(profile.error)) });
    }
    const account = await signUp(login.data);
    if (!account.ok) return fail(account.error, /too many/i.test(account.error) ? "rate_limited" : "validation", account.fieldErrors);
    const creatorId = await insertCreator(account.value.userId, profile.data);
    if (!creatorId) return fail("A creator profile already exists for this account.", "conflict");
    return ok({ creatorId });
  });
}

/** Adds a creator profile to an account that is already signed in (for example a brand teammate). */
export async function createCreatorProfile(input: CreatorProfileInput): Promise<ActionResult<{ creatorId: string }>> {
  return runCreatorAction(async () => {
    const current = await getCurrentSession();
    if (!current) return fail("Sign in to continue.", "forbidden");
    const parsed = creatorProfileSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    if (await findCreatorForUser(current.user.id)) return fail("You already have a creator profile.", "conflict");
    const creatorId = await insertCreator(current.user.id, parsed.data);
    if (!creatorId) return fail("You already have a creator profile.", "conflict");
    return ok({ creatorId });
  });
}

export async function updateCreatorProfile(input: CreatorProfileInput): Promise<ActionResult> {
  return runCreatorAction(async () => {
    const ctx = await requireCreatorAction();
    const parsed = creatorProfileSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const db = await getDb();
    await db.update(creators).set({ displayName: parsed.data.displayName, country: parsed.data.country }).where(eq(creators.id, ctx.creator.id));
    await recordAudit({ orgId: null, actorUserId: ctx.user.id, action: "creator.update_profile", targetType: "creator", targetId: ctx.creator.id });
    return ok(undefined, "Profile saved.");
  });
}

export interface SocialAccountRow {
  id: string;
  platform: Platform;
  handle: string;
  verification: "unverified" | "pending" | "verified" | "failed";
  dedicated: boolean;
  submissions: number;
  createdAt: string;
}

export async function listSocialAccounts(ctx: Pick<CreatorContext, "creator">): Promise<SocialAccountRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: socialAccounts.id,
      platform: socialAccounts.platform,
      handle: socialAccounts.handle,
      verification: socialAccounts.verification,
      dedicated: socialAccounts.dedicated,
      createdAt: socialAccounts.createdAt,
      submissions: count(posts.id),
    })
    .from(socialAccounts)
    .leftJoin(posts, and(eq(posts.socialAccountId, socialAccounts.id), eq(posts.creatorId, ctx.creator.id)))
    .where(eq(socialAccounts.creatorId, ctx.creator.id))
    .groupBy(socialAccounts.id)
    .orderBy(asc(socialAccounts.platform), asc(socialAccounts.handle));
  return rows.map((r) => ({ ...r, submissions: Number(r.submissions), createdAt: r.createdAt.toISOString() }));
}

export async function addSocialAccount(input: SocialAccountInput): Promise<ActionResult<{ id: string }>> {
  return runCreatorAction(async () => {
    const ctx = await requireCreatorAction();
    const parsed = socialAccountSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { platform, handle, dedicated } = parsed.data;
    const db = await getDb();
    const [{ n }] = await db.select({ n: count() }).from(socialAccounts).where(eq(socialAccounts.creatorId, ctx.creator.id));
    if (Number(n) >= MAX_SOCIAL_ACCOUNTS) return fail(`You can link up to ${MAX_SOCIAL_ACCOUNTS} accounts. Remove one to add another.`, "conflict");
    const id = newId("acc");
    const [row] = await db
      .insert(socialAccounts)
      .values({ id, creatorId: ctx.creator.id, platform, handle, dedicated, verification: "unverified" })
      .onConflictDoNothing({ target: [socialAccounts.platform, socialAccounts.handle] })
      .returning({ id: socialAccounts.id });
    if (!row) {
      return fail("Check the highlighted fields.", "conflict", {
        handle: `@${handle} on ${platformLabels[platform]} is already linked to a creator profile. If it's yours, contact support.`,
      });
    }
    await recordAudit({ orgId: null, actorUserId: ctx.user.id, action: "creator.add_social_account", targetType: "social_account", targetId: id, data: { platform } });
    return ok({ id }, `Added @${handle} on ${platformLabels[platform]}.`);
  });
}

/** Removes one of the creator's own accounts. Accounts with submissions stay linked so brands can trace those posts. */
export async function removeSocialAccount(input: { accountId: string }): Promise<ActionResult> {
  return runCreatorAction(async () => {
    const ctx = await requireCreatorAction();
    const accountId = z.string().trim().min(1).max(100).safeParse(input?.accountId);
    if (!accountId.success) return fail("Choose an account to remove.");
    const db = await getDb();
    const [account] = await db
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.id, accountId.data), eq(socialAccounts.creatorId, ctx.creator.id)))
      .limit(1);
    if (!account) throw new NotFoundError("Account not found.");
    const [{ n }] = await db.select({ n: count() }).from(posts).where(eq(posts.socialAccountId, account.id));
    if (Number(n) > 0) return fail("This account has submitted posts, so it stays linked: brands use it to trace those posts.", "conflict");
    await db.delete(socialAccounts).where(and(eq(socialAccounts.id, account.id), eq(socialAccounts.creatorId, ctx.creator.id)));
    await recordAudit({ orgId: null, actorUserId: ctx.user.id, action: "creator.remove_social_account", targetType: "social_account", targetId: account.id });
    return ok(undefined, "Account removed.");
  });
}
