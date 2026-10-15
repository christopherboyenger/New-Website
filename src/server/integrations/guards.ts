import "server-only";
import type { Permission } from "@/domain/permissions";
import { fail, type ActionResult } from "../action-result";
import { confirmPassword } from "../auth/service";
import { hasRecentAuth, markRecentAuth } from "../auth/session";
import { requireOrgAction, type OrgContext } from "../authz";

/** Minutes a password confirmation stays valid for integration and token changes. */
export const RECENT_AUTH_MINUTES = 30;

export type SensitiveGate = { ok: true; ctx: OrgContext } | { ok: false; result: ActionResult<never> };

/**
 * Authorizes a sensitive integration/token command: the permission (throws
 * Forbidden/NotFound, mapped by runAction), a verified email address, and a
 * password entered within the last RECENT_AUTH_MINUTES on this session.
 */
export async function requireSensitiveAction(slug: string, permission: Permission): Promise<SensitiveGate> {
  const ctx = await requireOrgAction(slug, permission);
  const blocked = sensitiveBlocker(ctx);
  return blocked ? { ok: false, result: blocked } : { ok: true, ctx };
}

/** The reason a sensitive change cannot proceed right now, or null. */
export function sensitiveBlocker(ctx: OrgContext): ActionResult<never> | null {
  if (!ctx.user.emailVerifiedAt) {
    return fail("Verify your email address before connecting integrations or managing API tokens.", "requires_verified_email");
  }
  if (!hasRecentAuth(ctx, RECENT_AUTH_MINUTES)) {
    return fail("Confirm your password to continue.", "requires_recent_auth");
  }
  return null;
}

/**
 * Step-up: re-checks the password (rate limited inside confirmPassword) and
 * marks this session as recently authenticated. Only members of the
 * workspace can call it for that workspace.
 */
export async function confirmRecentAuth(slug: string, password: string): Promise<ActionResult<{ confirmedAt: string }>> {
  const ctx = await requireOrgAction(slug, "workspace:read");
  if (!password) return fail("Enter your password.", "validation", { password: "Enter your password." });
  if (!(await confirmPassword(ctx.user.id, password))) {
    return fail("That password isn't correct, or there were too many attempts. Try again in a few minutes.", "requires_recent_auth", {
      password: "Incorrect password.",
    });
  }
  await markRecentAuth(ctx.session.id);
  return { ok: true, data: { confirmedAt: new Date().toISOString() } };
}
