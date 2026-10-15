"use server";

import "server-only";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/server/action-result";
import { requireOrgAction } from "@/server/authz";
import { getDb } from "@/server/db/client";
import { userFlags } from "@/server/db/schema";

/** Persists the sidebar's icon-rail (collapsed) preference for the signed-in user. */
export async function setSidebarCollapsedAction(orgSlug: string, collapsed: boolean): Promise<ActionResult<{ collapsed: boolean }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(orgSlug, "workspace:read");
    const parsed = z.boolean().safeParse(collapsed);
    if (!parsed.success) return fail("Unknown sidebar setting.");
    const db = await getDb();
    await db
      .insert(userFlags)
      .values({ userId: ctx.user.id, sidebarCollapsed: parsed.data })
      .onConflictDoUpdate({ target: userFlags.userId, set: { sidebarCollapsed: parsed.data } });
    return ok({ collapsed: parsed.data });
  });
}
