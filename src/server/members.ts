import "server-only";
import { and, asc, count, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { canManageTeammate, grantableRoles, type Actor } from "@/domain/permissions";
import { ConflictError, fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { confirmPassword } from "./auth/service";
import { markRecentAuth } from "./auth/session";
import { ForbiddenError, NotFoundError, requireOrgAction, type OrgContext } from "./authz";
import { getDb } from "./db/client";
import { memberships, organizations, roles, userFlags, users, type Role } from "./db/schema";

/**
 * Team members (L14) and the membership lifecycle: change role, remove,
 * transfer primary ownership and leave. Every command re-authorizes with
 * requireOrgAction and qualifies queries with the authorized orgId; a user ID
 * from the client only selects within that organization, so a member of
 * another workspace is "not found". Rank rules come from
 * src/domain/permissions.ts (DEC-005): owners manage members, the primary
 * owner manages owners, nobody manages the primary owner or themselves.
 */

export const MEMBERS_PAGE_SIZE = 10;

export const roleLabels: Record<Role, string> = { owner: "Owner", member: "Member" };

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TeamMemberRow {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  isPrimaryOwner: boolean;
  isYou: boolean;
  /** Whether the viewer may change this person's role or remove them. */
  canManage: boolean;
  /** Roles the viewer may assign to this person (empty when not manageable). */
  roleOptions: Role[];
}

/** Escapes LIKE wildcards so user input matches literally. */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function clampPage(page: number, total: number, pageSize: number): number {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, Math.floor(page) || 1), last);
}

export function displayName(user: { firstName: string; lastName: string; email: string }): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function actorFor(orgPrimaryOwnerId: string, member: { userId: string; role: Role }): Actor {
  return { role: member.role, isPrimaryOwner: orgPrimaryOwnerId === member.userId };
}

/** Team members of the authorized org; primary owner first, then owners, then by name. */
export async function listTeamMembers(ctx: OrgContext, opts: { query?: string | null; page?: number }): Promise<Paged<TeamMemberRow>> {
  const db = await getDb();
  const query = (opts.query ?? "").trim().slice(0, 100);
  const conditions: SQL[] = [eq(memberships.orgId, ctx.org.id)];
  if (query) {
    const pattern = likePattern(query);
    const search = or(ilike(users.email, pattern), ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, pattern));
    if (search) conditions.push(search);
  }
  const where = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(where);
  const page = clampPage(opts.page ?? 1, total, MEMBERS_PAGE_SIZE);
  const rows = await db
    .select({ userId: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, role: memberships.role, joinedAt: memberships.joinedAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(where)
    .orderBy(
      sql`case when ${users.id} = ${ctx.org.primaryOwnerUserId} then 0 when ${memberships.role} = 'owner' then 1 else 2 end`,
      asc(sql`lower(${users.firstName} || ' ' || ${users.lastName})`),
      asc(users.email),
    )
    .limit(MEMBERS_PAGE_SIZE)
    .offset((page - 1) * MEMBERS_PAGE_SIZE);

  return {
    total,
    page,
    pageSize: MEMBERS_PAGE_SIZE,
    rows: rows.map((r) => {
      const target = actorFor(ctx.org.primaryOwnerUserId, r);
      const isYou = r.userId === ctx.user.id;
      const canManage = canManageTeammate(ctx.actor, target, isYou);
      return {
        userId: r.userId,
        name: displayName(r),
        email: r.email,
        role: r.role,
        joinedAt: r.joinedAt.toISOString(),
        isPrimaryOwner: target.isPrimaryOwner,
        isYou,
        canManage,
        roleOptions: canManage ? grantableRoles(ctx.actor) : [],
      };
    }),
  };
}

/** Owners other than the primary owner: the only valid ownership-transfer targets. */
export async function listTransferCandidates(ctx: OrgContext): Promise<Array<{ userId: string; name: string; email: string }>> {
  if (!ctx.actor.isPrimaryOwner) return [];
  const db = await getDb();
  const rows = await db
    .select({ userId: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.role, "owner"), sql`${users.id} <> ${ctx.org.primaryOwnerUserId}`))
    .orderBy(asc(users.email));
  return rows.map((r) => ({ userId: r.userId, name: displayName(r), email: r.email }));
}

/* ----------------------------------------------------------------------------
 * Commands
 * ------------------------------------------------------------------------- */

const userIdSchema = z.string().trim().min(1).max(100);
const changeRoleSchema = z.object({ userId: userIdSchema, role: z.enum(roles) });
const removeSchema = z.object({ userId: userIdSchema });
const transferSchema = z.object({
  userId: userIdSchema,
  password: z.string().min(1, "Enter your password to confirm.").max(1000),
});

/** Loads a teammate of the authorized org and checks the actor may manage them. */
async function manageableTarget(ctx: OrgContext, userId: string) {
  const db = await getDb();
  const [target] = await db
    .select({ userId: memberships.userId, role: memberships.role, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, userId)))
    .limit(1);
  if (!target) throw new NotFoundError("That teammate is not part of this workspace.");
  const targetActor = actorFor(ctx.org.primaryOwnerUserId, target);
  if (!canManageTeammate(ctx.actor, targetActor, target.userId === ctx.user.id)) {
    throw new ForbiddenError("members:manage");
  }
  return target;
}

function teammateDeniedMessage(error: unknown): ActionResult<never> | null {
  if (error instanceof ForbiddenError) return fail("You can only manage teammates below your own role. Nobody can change the primary owner.", "forbidden");
  return null;
}

export async function changeMemberRole(slug: string, input: unknown): Promise<ActionResult<{ role: Role }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "members:manage");
    const parsed = changeRoleSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    try {
      const target = await manageableTarget(ctx, parsed.data.userId);
      if (!grantableRoles(ctx.actor).includes(parsed.data.role)) {
        return fail("Only the primary owner can make someone an Owner.", "forbidden");
      }
      if (target.role === parsed.data.role) return ok({ role: target.role });
      const db = await getDb();
      await db.transaction(async (tx) => {
        await tx
          .update(memberships)
          .set({ role: parsed.data.role })
          .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, target.userId)));
        await recordAudit(
          { orgId: ctx.org.id, actorUserId: ctx.user.id, action: "member.role_change", targetType: "user", targetId: target.userId, data: { from: target.role, to: parsed.data.role } },
          tx,
        );
      });
      return ok({ role: parsed.data.role }, `Role changed to ${roleLabels[parsed.data.role]}.`);
    } catch (error) {
      const denied = teammateDeniedMessage(error);
      if (denied) return denied;
      throw error;
    }
  });
}

/**
 * Removes a teammate. Access ends immediately because every page and action
 * re-reads membership. Content they created stays (it belongs to the org).
 */
export async function removeMember(slug: string, input: unknown): Promise<ActionResult<{ userId: string }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "members:manage");
    const parsed = removeSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    try {
      const target = await manageableTarget(ctx, parsed.data.userId);
      const db = await getDb();
      await db.transaction(async (tx) => {
        await tx.delete(memberships).where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, target.userId)));
        await tx.update(userFlags).set({ lastOrgId: null }).where(and(eq(userFlags.userId, target.userId), eq(userFlags.lastOrgId, ctx.org.id)));
        await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "member.remove", targetType: "user", targetId: target.userId, data: { role: target.role } }, tx);
      });
      return ok({ userId: target.userId }, "Teammate removed. They no longer have access to this workspace.");
    } catch (error) {
      const denied = teammateDeniedMessage(error);
      if (denied) return denied;
      throw error;
    }
  });
}

/**
 * Hands primary ownership to an existing Owner. Primary owner only; the
 * password is re-entered every time (step-up) and the session is marked as
 * recently authenticated. The previous primary owner stays an Owner.
 */
export async function transferOwnership(slug: string, input: unknown): Promise<ActionResult<{ userId: string }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "ownership:transfer");
    const parsed = transferSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { userId, password } = parsed.data;
    if (userId === ctx.user.id) return fail("Choose another Owner to receive primary ownership.", "validation", { userId: "Choose another Owner." });

    const db = await getDb();
    const [target] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, userId)))
      .limit(1);
    if (!target) throw new NotFoundError("That teammate is not part of this workspace.");
    if (target.role !== "owner") {
      return fail("Primary ownership can only go to someone who is already an Owner. Make them an Owner first.", "validation", { userId: "Must already be an Owner." });
    }

    if (!(await confirmPassword(ctx.user.id, password))) {
      return fail("That password isn't correct.", "requires_recent_auth", { password: "Incorrect password." });
    }
    await markRecentAuth(ctx.session.id);

    await db.transaction(async (tx) => {
      const updated = await tx
        .update(organizations)
        .set({ primaryOwnerUserId: userId, updatedAt: new Date() })
        .where(and(eq(organizations.id, ctx.org.id), eq(organizations.primaryOwnerUserId, ctx.user.id)))
        .returning({ id: organizations.id });
      if (updated.length === 0) throw new ConflictError("Ownership changed while you were confirming. Reload and try again.");
      await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "ownership.transfer", targetType: "user", targetId: userId, data: { from: ctx.user.id } }, tx);
    });
    return ok({ userId }, "Primary ownership transferred. You remain an Owner.");
  });
}

/** Leaves the workspace. The primary owner must transfer ownership first. */
export async function leaveWorkspace(slug: string): Promise<ActionResult<{ left: true }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "workspace:read");
    if (ctx.actor.isPrimaryOwner) {
      return fail("You're the primary owner. Transfer primary ownership to another Owner before leaving.", "forbidden");
    }
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.delete(memberships).where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, ctx.user.id)));
      await tx.update(userFlags).set({ lastOrgId: null }).where(and(eq(userFlags.userId, ctx.user.id), eq(userFlags.lastOrgId, ctx.org.id)));
      await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "member.leave", targetType: "user", targetId: ctx.user.id, data: { role: ctx.role } }, tx);
    });
    return ok({ left: true as const }, "You left the workspace.");
  });
}
