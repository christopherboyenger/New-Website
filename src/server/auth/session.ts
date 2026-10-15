import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { site } from "@/config/site";
import { generateToken, tokenDigest } from "../crypto";
import { getDb } from "../db/client";
import { sessions, users } from "../db/schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const secureCookies = site.appUrl.startsWith("https://");
/** `__Host-` prefix pins the cookie to this origin over HTTPS (no Domain, Path=/). */
export const SESSION_COOKIE = secureCookies ? "__Host-session" : "session";

export type SessionUser = typeof users.$inferSelect;
export type SessionRecord = typeof sessions.$inferSelect;

export interface CurrentSession {
  session: SessionRecord;
  user: SessionUser;
}

/** Creates a session row and sets the cookie. Only call from Server Actions or Route Handlers. */
export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = generateToken();
  const now = new Date();
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(sessions).values({
    id: newId("ses"),
    tokenDigest: tokenDigest(token, "session"),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    recentAuthAt: now,
    userAgent,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenDigest, tokenDigest(token, "session")),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        isNull(users.disabledAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
});

/** Requires a signed-in user; otherwise redirects to sign-in and returns to `next` afterwards. */
export async function requireUser(next?: string): Promise<CurrentSession> {
  const current = await getCurrentSession();
  if (!current) {
    const target = next && isSafeReturnPath(next) ? `?next=${encodeURIComponent(next)}` : "";
    redirect(`/auth/sign-in${target}`);
  }
  return current;
}

/** Sensitive actions (connect providers, billing, tokens, ownership) need a recent password entry. */
export function hasRecentAuth(current: CurrentSession, maxAgeMinutes = 30): boolean {
  return Date.now() - current.session.recentAuthAt.getTime() <= maxAgeMinutes * 60 * 1000;
}

export async function markRecentAuth(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.update(sessions).set({ recentAuthAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenDigest, tokenDigest(token, "session")));
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessionsForUser(userId: string, exceptSessionId?: string): Promise<void> {
  const db = await getDb();
  const all = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  for (const s of all) {
    if (s.id !== exceptSessionId) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, s.id));
  }
}

/** Internal, same-origin relative paths only (blocks `//evil.com`, `/\\evil.com`, schemes). */
export function isSafeReturnPath(path: string): boolean {
  return /^\/(?![/\\])[^\s]*$/.test(path) && !path.includes("\\");
}
