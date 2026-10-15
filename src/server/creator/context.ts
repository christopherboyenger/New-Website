import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { fail, runAction, type ActionResult } from "../action-result";
import { getCurrentSession, requireUser, type CurrentSession } from "../auth/session";
import { NotFoundError } from "../authz";
import { getDb } from "../db/client";
import { creators } from "../db/schema";

/**
 * Creator identity for the creator portal. A creator profile is linked to
 * exactly one user (creators.user_id is unique); a user may also belong to
 * brand workspaces. Every creator query is qualified by the creator ID
 * resolved here from the session — never by an ID sent from the client.
 */

export type CreatorProfile = typeof creators.$inferSelect;

export interface CreatorContext extends CurrentSession {
  creator: CreatorProfile;
}

export class CreatorSignInRequiredError extends Error {
  constructor() {
    super("Sign in to continue.");
    this.name = "CreatorSignInRequiredError";
  }
}

export async function findCreatorForUser(userId: string): Promise<CreatorProfile | null> {
  const db = await getDb();
  const [row] = await db.select().from(creators).where(eq(creators.userId, userId)).limit(1);
  return row ?? null;
}

/** The signed-in user's creator profile for this request, or null (signed out or no profile). */
export const loadCreatorContext = cache(async (): Promise<CreatorContext | null> => {
  const current = await getCurrentSession();
  if (!current) return null;
  const creator = await findCreatorForUser(current.user.id);
  return creator ? { ...current, creator } : null;
});

/** For creator pages: signed out → sign-in (returning to `next`); no profile yet → creator sign-up. */
export async function requireCreatorPage(next: string): Promise<CreatorContext> {
  await requireUser(next);
  const ctx = await loadCreatorContext();
  if (!ctx) redirect("/creator/sign-up");
  return ctx;
}

/** For creator Server Actions: throws (mapped by runAction) instead of redirecting. */
export async function requireCreatorAction(): Promise<CreatorContext> {
  const current = await getCurrentSession();
  if (!current) throw new CreatorSignInRequiredError();
  const ctx = await loadCreatorContext();
  if (!ctx) throw new NotFoundError("Create your creator profile first.");
  return ctx;
}

/** runAction plus the creator-specific signed-out failure. */
export async function runCreatorAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return runAction(async () => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof CreatorSignInRequiredError) return fail(error.message, "forbidden");
      throw error;
    }
  });
}
