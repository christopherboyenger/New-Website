import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "./db/client";
import { rateLimitBuckets } from "./db/schema";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** When the current window resets. */
  resetAt: Date;
}

/**
 * Fixed-window counter persisted in the database (works across serverless
 * instances). `key` should include the action and the subject, e.g.
 * `login:email:a@b.com` or `api:grant:api_123`.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number, now = new Date()): Promise<RateLimitResult> {
  const db = await getDb();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const rows = await db
    .insert(rateLimitBuckets)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  const used = rows[0]?.count ?? limit + 1;
  return {
    allowed: used <= limit,
    remaining: Math.max(0, limit - used),
    limit,
    resetAt: new Date(windowStart.getTime() + windowMs),
  };
}
