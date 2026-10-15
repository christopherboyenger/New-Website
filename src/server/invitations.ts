import "server-only";
import { and, count, desc, eq, ilike, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { grantableRoles } from "@/domain/permissions";
import { newId } from "@/lib/ids";
import { site } from "@/config/site";
import { fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { emailSchema } from "./auth/service";
import { getCurrentSession } from "./auth/session";
import { NotFoundError, requireOrgAction, type OrgContext } from "./authz";
import { generateToken, tokenDigest } from "./crypto";
import { getDb, type DbLike } from "./db/client";
import { invitations, memberships, organizations, roles, userFlags, users, type Role } from "./db/schema";
import { absoluteUrl, sendEmail, type EmailDeliveryStatus } from "./email";
import { clampPage, displayName, likePattern, roleLabels, type Paged } from "./members";
import { consumeRateLimit } from "./rate-limit";

/**
 * Team invitations (L14 Pending Invites, L32 dialog, /invitations/[token]).
 *
 * - Only owners invite (`members:invite`), only roles they may grant
 *   (`grantableRoles`), and only from a verified email address.
 * - The token is 32 random bytes; only its keyed digest is stored. The link
 *   is shown to the inviter exactly once, in the response to the request
 *   that created it, and only when the email was NOT delivered.
 * - Invitations expire after 7 days. `expired` is derived from expiresAt.
 * - One open (non-accepted) invitation per email per org: inviting an email
 *   whose invitation expired or was revoked renews that row with a new token.
 */

export const INVITE_TTL_DAYS = 7;
export const MAX_INVITES_PER_REQUEST = 10;
export const INVITES_PAGE_SIZE = 10;
/** Invitation emails per inviter per hour, and per workspace per day. */
const USER_HOURLY_LIMIT = 30;
const ORG_DAILY_LIMIT = 100;

export type InviteDisplayStatus = "pending" | "expired" | "revoked";

export interface InviteRow {
  id: string;
  email: string;
  role: Role;
  invitedAt: string;
  expiresAt: string;
  status: InviteDisplayStatus;
  invitedBy: string;
  /** Whether the viewer may revoke/renew it (owners, for roles they could grant). */
  canManage: boolean;
}

export type InviteOutcome = EmailDeliveryStatus | "already_member" | "already_invited";

export interface InviteResult {
  email: string;
  outcome: InviteOutcome;
  /** Present only when the email was not delivered; never stored or shown again. */
  inviteUrl?: string;
}

export function inviteStatus(row: { status: string; expiresAt: Date }, now = new Date()): InviteDisplayStatus | "accepted" {
  if (row.status === "accepted") return "accepted";
  if (row.status === "revoked") return "revoked";
  return row.expiresAt.getTime() <= now.getTime() ? "expired" : "pending";
}

/** "jordan@example.com" → "j•••n@example.com" (enough to recognise, not to harvest). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const masked = local.length <= 2 ? `${local[0] ?? ""}•••` : `${local[0]}•••${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}

export function inviteUrlFor(token: string): string {
  return absoluteUrl(`/invitations/${encodeURIComponent(token)}`);
}

/* ----------------------------------------------------------------------------
 * Pending invites table
 * ------------------------------------------------------------------------- */

export async function listInvitations(ctx: OrgContext, opts: { query?: string | null; page?: number }): Promise<Paged<InviteRow>> {
  const db = await getDb();
  const query = (opts.query ?? "").trim().slice(0, 100);
  const conditions: SQL[] = [eq(invitations.orgId, ctx.org.id), ne(invitations.status, "accepted")];
  if (query) conditions.push(ilike(invitations.email, likePattern(query)));
  const where = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(invitations).where(where);
  const page = clampPage(opts.page ?? 1, total, INVITES_PAGE_SIZE);
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
      status: invitations.status,
      firstName: users.firstName,
      lastName: users.lastName,
      inviterEmail: users.email,
    })
    .from(invitations)
    .innerJoin(users, eq(users.id, invitations.invitedByUserId))
    .where(where)
    .orderBy(desc(invitations.createdAt), desc(invitations.id))
    .limit(INVITES_PAGE_SIZE)
    .offset((page - 1) * INVITES_PAGE_SIZE);
  const grantable = grantableRoles(ctx.actor);
  const now = new Date();
  return {
    total,
    page,
    pageSize: INVITES_PAGE_SIZE,
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      invitedAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      status: inviteStatus(r, now) as InviteDisplayStatus,
      invitedBy: displayName({ firstName: r.firstName, lastName: r.lastName, email: r.inviterEmail }),
      canManage: grantable.includes(r.role),
    })),
  };
}

/* ----------------------------------------------------------------------------
 * Create / renew / revoke
 * ------------------------------------------------------------------------- */

const createSchema = z.object({
  emails: z.array(z.string().max(320)).max(MAX_INVITES_PER_REQUEST, `Invite up to ${MAX_INVITES_PER_REQUEST} people at a time.`),
  role: z.enum(roles, "Choose a role."),
});

/** Validates each email row; errors are keyed by the row index the dialog shows (`emails.<i>`). */
export function parseInviteEmails(raw: string[]): { emails: string[] } | { fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const emails: string[] = [];
  raw.forEach((value, index) => {
    if (!value.trim()) return;
    const parsed = emailSchema.safeParse(value);
    if (parsed.success) emails.push(parsed.data);
    else fieldErrors[`emails.${index}`] = "Enter a valid email address.";
  });
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  if (emails.length === 0) return { fieldErrors: { "emails.0": "Enter at least one email address." } };
  return { emails: [...new Set(emails)] };
}

const idSchema = z.object({ id: z.string().trim().min(1).max(100) });

async function sendInvitationEmail(ctx: OrgContext, email: string, role: Role, token: string): Promise<EmailDeliveryStatus> {
  const inviter = displayName(ctx.user);
  const result = await sendEmail({
    to: email,
    template: "invitation",
    subject: `${inviter} invited you to ${ctx.org.name} on ${site.name}`,
    body:
      `${inviter} invited you to join the ${ctx.org.name} workspace on ${site.name} as ${role === "owner" ? "an Owner" : "a Member"}.\n\n` +
      `Accept the invitation within ${INVITE_TTL_DAYS} days:\n\n${inviteUrlFor(token)}\n\n` +
      `If you weren't expecting this, you can ignore this message.`,
  });
  return result.status;
}

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Serializes concurrent invites for the same email within one org (one open invitation per email). */
async function lockEmail(tx: DbLike, orgId: string, email: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invite:${orgId}:${email}`}))`);
}

type Issue = { kind: "already_member" | "already_invited" } | { kind: "issued"; id: string; token: string };

/** Creates or renews the open invitation for `email`, inside one transaction. */
async function issueInvitation(ctx: OrgContext, email: string, role: Role, renewId?: string): Promise<Issue> {
  const db = await getDb();
  return db.transaction(async (tx): Promise<Issue> => {
    await lockEmail(tx, ctx.org.id, email);
    const [member] = await tx
      .select({ userId: users.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, ctx.org.id), eq(users.email, email)))
      .limit(1);
    if (member) return { kind: "already_member" };

    const now = new Date();
    const open = await tx
      .select({ id: invitations.id, status: invitations.status, expiresAt: invitations.expiresAt })
      .from(invitations)
      .where(and(eq(invitations.orgId, ctx.org.id), eq(invitations.email, email), ne(invitations.status, "accepted")))
      .orderBy(desc(invitations.createdAt));
    const live = open.find((row) => inviteStatus(row, now) === "pending");
    if (live && live.id !== renewId) return { kind: "already_invited" };

    const token = generateToken();
    const values = {
      role,
      tokenDigest: tokenDigest(token, "invitation"),
      invitedByUserId: ctx.user.id,
      createdAt: now,
      expiresAt: expiryFrom(now),
      status: "pending" as const,
      revokedAt: null,
    };
    const reuse = renewId ? open.find((row) => row.id === renewId) : open[0];
    let id: string;
    if (reuse) {
      id = reuse.id;
      await tx.update(invitations).set(values).where(and(eq(invitations.id, reuse.id), eq(invitations.orgId, ctx.org.id)));
      // Older duplicates (if any) are closed so only one open invitation remains.
      for (const extra of open) if (extra.id !== reuse.id) await tx.update(invitations).set({ status: "revoked", revokedAt: now }).where(eq(invitations.id, extra.id));
    } else {
      id = newId("inv");
      await tx.insert(invitations).values({ id, orgId: ctx.org.id, email, ...values });
    }
    await recordAudit(
      { orgId: ctx.org.id, actorUserId: ctx.user.id, action: reuse ? "member.invite_renew" : "member.invite", targetType: "invitation", targetId: id, data: { role } },
      tx,
    );
    return { kind: "issued", id, token };
  });
}

async function deliver(ctx: OrgContext, email: string, role: Role, token: string): Promise<InviteResult> {
  const status = await sendInvitationEmail(ctx, email, role, token);
  return status === "sent" ? { email, outcome: status } : { email, outcome: status, inviteUrl: inviteUrlFor(token) };
}

function requireVerifiedInviter(ctx: OrgContext): ActionResult<never> | null {
  if (ctx.user.emailVerifiedAt) return null;
  return fail("Verify your email address before inviting teammates.", "requires_verified_email");
}

async function consumeInviteQuota(ctx: OrgContext, emails: number): Promise<boolean> {
  for (let i = 0; i < emails; i++) {
    const perUser = await consumeRateLimit(`invite:user:${ctx.user.id}`, USER_HOURLY_LIMIT, 60 * 60);
    const perOrg = await consumeRateLimit(`invite:org:${ctx.org.id}`, ORG_DAILY_LIMIT, 24 * 60 * 60);
    if (!perUser.allowed || !perOrg.allowed) return false;
  }
  return true;
}

export async function createInvitations(slug: string, input: unknown): Promise<ActionResult<{ results: InviteResult[] }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "members:invite");
    const unverified = requireVerifiedInviter(ctx);
    if (unverified) return unverified;
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { role } = parsed.data;
    const list = parseInviteEmails(parsed.data.emails);
    if ("fieldErrors" in list) return fail("Check the highlighted email addresses.", "validation", list.fieldErrors);
    const { emails } = list;
    if (!grantableRoles(ctx.actor).includes(role)) {
      return fail("Only the primary owner can invite Owners.", "forbidden", { role: "Choose Member." });
    }
    if (!(await consumeInviteQuota(ctx, emails.length))) {
      return fail("Too many invitations sent recently. Try again later.", "rate_limited");
    }

    const results: InviteResult[] = [];
    for (const email of emails) {
      const issued = await issueInvitation(ctx, email, role);
      if (issued.kind !== "issued") results.push({ email, outcome: issued.kind });
      else results.push(await deliver(ctx, email, role, issued.token));
    }
    const created = results.filter((r) => r.outcome !== "already_member" && r.outcome !== "already_invited").length;
    return ok({ results }, created === 0 ? "No new invitations were created." : undefined);
  });
}

async function manageableInvitation(ctx: OrgContext, id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: invitations.id, email: invitations.email, role: invitations.role, status: invitations.status, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.orgId, ctx.org.id)))
    .limit(1);
  if (!row || row.status === "accepted") throw new NotFoundError("That invitation was not found.");
  return row;
}

/** Issues a new token and a fresh 7-day expiry (old links stop working), then emails it. */
export async function renewInvitation(slug: string, input: unknown): Promise<ActionResult<InviteResult>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "members:invite");
    const unverified = requireVerifiedInviter(ctx);
    if (unverified) return unverified;
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const row = await manageableInvitation(ctx, parsed.data.id);
    if (!grantableRoles(ctx.actor).includes(row.role)) return fail("Only the primary owner can manage Owner invitations.", "forbidden");
    if (!(await consumeInviteQuota(ctx, 1))) return fail("Too many invitations sent recently. Try again later.", "rate_limited");
    const issued = await issueInvitation(ctx, row.email, row.role, row.id);
    if (issued.kind !== "issued") return ok({ email: row.email, outcome: issued.kind });
    return ok(await deliver(ctx, row.email, row.role, issued.token));
  });
}

export async function revokeInvitation(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "members:invite");
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const row = await manageableInvitation(ctx, parsed.data.id);
    if (!grantableRoles(ctx.actor).includes(row.role)) return fail("Only the primary owner can manage Owner invitations.", "forbidden");
    if (row.status === "revoked") return ok({ id: row.id });
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx
        .update(invitations)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(and(eq(invitations.id, row.id), eq(invitations.orgId, ctx.org.id)));
      await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "member.invite_revoke", targetType: "invitation", targetId: row.id }, tx);
    });
    return ok({ id: row.id }, "Invitation revoked. Its link no longer works.");
  });
}

/* ----------------------------------------------------------------------------
 * Accepting (/invitations/[token])
 * ------------------------------------------------------------------------- */

export interface InvitationView {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  email: string;
  role: Role;
  roleLabel: string;
  inviterName: string;
  expiresAt: string;
  status: "pending" | "accepted";
  acceptedUserId: string | null;
}

/**
 * Looks an invitation up by token digest. Returns null for unknown, expired
 * or revoked tokens (callers show one generic "invalid or expired" message).
 * Accepted invitations are returned only so the person who accepted them can
 * be sent to the workspace again.
 */
export async function findInvitationByToken(token: string): Promise<InvitationView | null> {
  if (!token || token.length > 200) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      id: invitations.id,
      orgId: invitations.orgId,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      acceptedUserId: invitations.acceptedUserId,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      inviterFirst: users.firstName,
      inviterLast: users.lastName,
      inviterEmail: users.email,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .innerJoin(users, eq(users.id, invitations.invitedByUserId))
    .where(eq(invitations.tokenDigest, tokenDigest(token, "invitation")))
    .limit(1);
  if (!row) return null;
  const status = inviteStatus(row);
  if (status !== "pending" && status !== "accepted") return null;
  return {
    id: row.id,
    orgId: row.orgId,
    orgName: row.orgName,
    orgSlug: row.orgSlug,
    email: row.email,
    role: row.role,
    roleLabel: roleLabels[row.role],
    inviterName: displayName({ firstName: row.inviterFirst, lastName: row.inviterLast, email: row.inviterEmail }),
    expiresAt: row.expiresAt.toISOString(),
    status,
    acceptedUserId: row.acceptedUserId,
  };
}

const INVALID = "This invitation link is invalid or has expired. Ask a workspace owner to send a new one.";

/**
 * Accepts for the signed-in user. The account email must match the invited
 * address and be verified. Joining is idempotent: an existing membership is
 * kept as is (its role is not changed), and repeating an accepted invitation
 * as the same user succeeds.
 */
export async function acceptInvitation(token: string): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    const current = await getCurrentSession();
    if (!current) return fail("Sign in to accept this invitation.", "forbidden");
    const invitation = await findInvitationByToken(token);
    if (!invitation) return fail(INVALID, "not_found");
    if (invitation.status === "accepted") {
      if (invitation.acceptedUserId !== current.user.id) return fail(INVALID, "not_found");
      return ok({ slug: invitation.orgSlug });
    }
    if (current.user.email !== invitation.email.toLowerCase()) {
      return fail(`This invitation was sent to ${maskEmail(invitation.email)}. Sign in with that account to accept it.`, "forbidden");
    }
    if (!current.user.emailVerifiedAt) {
      return fail("Verify your email address before joining the workspace.", "requires_verified_email");
    }

    const db = await getDb();
    const accepted = await db.transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx
        .update(invitations)
        .set({ status: "accepted", acceptedAt: now, acceptedUserId: current.user.id })
        .where(and(eq(invitations.id, invitation.id), eq(invitations.status, "pending"), sql`${invitations.expiresAt} > ${now}`))
        .returning({ id: invitations.id });
      if (claimed.length === 0) return false;
      const inserted = await tx
        .insert(memberships)
        .values({ orgId: invitation.orgId, userId: current.user.id, role: invitation.role, joinedAt: now })
        .onConflictDoNothing()
        .returning({ userId: memberships.userId });
      await tx
        .insert(userFlags)
        .values({ userId: current.user.id, lastOrgId: invitation.orgId })
        .onConflictDoUpdate({ target: userFlags.userId, set: { lastOrgId: invitation.orgId } });
      await recordAudit(
        {
          orgId: invitation.orgId,
          actorUserId: current.user.id,
          action: "member.invite_accept",
          targetType: "invitation",
          targetId: invitation.id,
          data: { role: invitation.role, alreadyMember: inserted.length === 0 },
        },
        tx,
      );
      return true;
    });
    if (!accepted) return fail(INVALID, "not_found");
    return ok({ slug: invitation.orgSlug }, `You joined ${invitation.orgName}.`);
  });
}
