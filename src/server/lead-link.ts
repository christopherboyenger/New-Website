import "server-only";

/**
 * Links the visitor's marketing lead (from the `/start` funnel) to the account
 * they just created. The lead is found only through the visitor's own httpOnly
 * lead cookie, and is linked only when its work email matches the new account's
 * email and it isn't linked to someone already — so a shared or stale cookie
 * can never attach another person's lead to this account.
 */
import { cookies } from "next/headers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { site } from "@/config/site";
import { getDb } from "./db/client";
import { leads } from "./db/schema";

const LEAD_ID_RE = /^lead_[a-z0-9]{20}$/;

/** `__Host-` prefix on HTTPS deployments (requires Secure, Path=/, no Domain). */
export function leadCookieName(): string {
  return site.appUrl.startsWith("https://") ? "__Host-lead" : "lead";
}

/** The lead ID from the visitor's cookie, if well-formed. */
export async function readLeadCookie(): Promise<string | null> {
  const id = (await cookies()).get(leadCookieName())?.value;
  return id && LEAD_ID_RE.test(id) ? id : null;
}

/** Returns whether a lead was linked. Never throws for a missing/foreign lead. */
export async function linkVisitorLeadToUser(userId: string, email: string): Promise<boolean> {
  const leadId = await readLeadCookie();
  if (!leadId) return false;
  const db = await getDb();
  const linked = await db
    .update(leads)
    .set({ userId, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), isNull(leads.userId), eq(sql`lower(${leads.email})`, email.trim().toLowerCase())))
    .returning({ id: leads.id });
  return linked.length > 0;
}
