import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { can, permissionDeniedMessages, type Actor, type Permission } from "@/domain/permissions";
import { getCurrentSession, requireUser, type CurrentSession } from "./auth/session";
import { getDb } from "./db/client";
import { memberships, organizations, type Role } from "./db/schema";

export type Organization = typeof organizations.$inferSelect;

/** Minimal context domain commands need: the authorized org and the acting user. */
export interface CommandContext {
  org: Organization;
  user: { id: string };
}

export interface OrgContext extends CurrentSession {
  org: Organization;
  role: Role;
  actor: Actor;
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(permissionDeniedMessages[permission] ?? "You do not have permission to do that.");
    this.name = "ForbiddenError";
  }
}

/** Raised when an org or entity is missing OR not accessible — callers must not distinguish the two. */
export class NotFoundError extends Error {
  constructor(what = "Not found") {
    super(what);
    this.name = "NotFoundError";
  }
}

/**
 * Resolves the organization from the URL slug for the signed-in user. The slug
 * only selects; membership authorizes. Non-members get the same 404 as a
 * nonexistent slug, so workspace existence is not leaked.
 */
export const loadOrgContext = cache(async (slug: string): Promise<OrgContext | null> => {
  const current = await getCurrentSession();
  if (!current) return null;
  const db = await getDb();
  const rows = await db
    .select({ org: organizations, role: memberships.role })
    .from(organizations)
    .innerJoin(memberships, and(eq(memberships.orgId, organizations.id), eq(memberships.userId, current.user.id)))
    .where(eq(organizations.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const actor: Actor = { role: row.role, isPrimaryOwner: row.org.primaryOwnerUserId === current.user.id };
  return { ...current, org: row.org, role: row.role, actor };
});

/** For pages/layouts: redirects to sign-in when signed out, 404s when not a member. */
export async function requireOrgPage(slug: string, next?: string): Promise<OrgContext> {
  await requireUser(next ?? `/home/${slug}`);
  const ctx = await loadOrgContext(slug);
  if (!ctx) notFound();
  return ctx;
}

/** For Server Actions / Route Handlers: throws instead of redirecting. */
export async function requireOrgAction(slug: string, permission: Permission = "workspace:read"): Promise<OrgContext> {
  const ctx = await loadOrgContext(slug);
  if (!ctx) throw new NotFoundError("Workspace not found.");
  if (!can(ctx.actor, permission)) throw new ForbiddenError(permission);
  return ctx;
}

export function hasPermission(ctx: OrgContext, permission: Permission): boolean {
  return can(ctx.actor, permission);
}

/** All workspaces the user belongs to (brand switcher, `/home` redirect). */
export async function listUserOrganizations(userId: string): Promise<Array<{ org: Organization; role: Role }>> {
  const db = await getDb();
  return db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(organizations.name);
}
