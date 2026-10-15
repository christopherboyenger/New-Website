import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeOrg, makeUser } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { requireOrgAction } from "./authz";
import { tokenDigest } from "./crypto";
import { getDb } from "./db/client";
import { auditLog, emailOutbox, invitations, memberships } from "./db/schema";
import {
  acceptInvitation,
  createInvitations,
  findInvitationByToken,
  INVITE_TTL_DAYS,
  listInvitations,
  maskEmail,
  renewInvitation,
  revokeInvitation,
} from "./invitations";

function tokenFrom(url: string | undefined): string {
  if (!url) throw new Error("expected an invite link");
  return decodeURIComponent(new URL(url).pathname.split("/").pop()!);
}

async function invite(slug: string, email: string, role: "owner" | "member" = "member") {
  const result = await createInvitations(slug, { emails: [email], role });
  if (!result.ok) throw new Error(result.error);
  return result.data.results[0];
}

describe("invitations", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("stores only the token digest and reports the real delivery state with a one-time link", async () => {
    const { org, owner } = await makeOrg({ name: "Brand Co" });
    await signInAs(owner.id);
    const result = await createInvitations(org.slug, { emails: ["  New@Example.test ", "", "new@example.test"], role: "member" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.results).toHaveLength(1);
    const [first] = result.data.results;
    expect(first).toMatchObject({ email: "new@example.test", outcome: "provider_unconfigured" });
    const token = tokenFrom(first.inviteUrl);

    const db = await getDb();
    const rows = await db.select().from(invitations).where(eq(invitations.orgId, org.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenDigest).toBe(tokenDigest(token, "invitation"));
    expect(JSON.stringify(rows[0])).not.toContain(token);
    const days = (rows[0].expiresAt.getTime() - rows[0].createdAt.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(INVITE_TTL_DAYS, 5);
    const [mail] = await db.select().from(emailOutbox);
    expect(mail).toMatchObject({ toEmail: "new@example.test", template: "invitation", status: "provider_unconfigured" });

    const ctx = await requireOrgAction(org.slug);
    const listed = await listInvitations(ctx, {});
    expect(listed.rows).toMatchObject([{ email: "new@example.test", role: "member", status: "pending", canManage: true }]);
  });

  it("validates emails per row, roles per actor, verified inviter and permissions", async () => {
    const { org, owner } = await makeOrg();
    const coOwner = await addMember(org.id, "owner");
    const member = await addMember(org.id, "member");
    const unverified = await addMember(org.id, "owner", await makeUser({ emailVerifiedAt: null }));

    await signInAs(owner.id);
    const bad = await createInvitations(org.slug, { emails: ["ok@example.test", "not-an-email"], role: "member" });
    expect(bad).toMatchObject({ ok: false, code: "validation", fieldErrors: { "emails.1": "Enter a valid email address." } });
    expect(await createInvitations(org.slug, { emails: [""], role: "member" })).toMatchObject({ ok: false, code: "validation" });
    expect(await createInvitations(org.slug, { emails: ["a@example.test"], role: "admin" })).toMatchObject({ ok: false, code: "validation" });

    await signInAs(coOwner.id);
    expect(await createInvitations(org.slug, { emails: ["o@example.test"], role: "owner" })).toMatchObject({ ok: false, code: "forbidden" });

    await signInAs(member.id);
    expect(await createInvitations(org.slug, { emails: ["m@example.test"], role: "member" })).toMatchObject({ ok: false, code: "forbidden" });

    await signInAs(unverified.id);
    expect(await createInvitations(org.slug, { emails: ["u@example.test"], role: "member" })).toMatchObject({ ok: false, code: "requires_verified_email" });

    const db = await getDb();
    expect(await db.select().from(invitations)).toHaveLength(0);
  });

  it("keeps one open invitation per email and skips existing members", async () => {
    const { org, owner } = await makeOrg();
    await addMember(org.id, "member", await makeUser({ email: "here@example.test" }));
    await signInAs(owner.id);
    await invite(org.slug, "dup@example.test");
    const again = await createInvitations(org.slug, { emails: ["dup@example.test", "HERE@example.test"], role: "member" });
    expect(again).toMatchObject({ ok: true, data: { results: [{ outcome: "already_invited" }, { outcome: "already_member" }] } });
    const db = await getDb();
    expect(await db.select().from(invitations)).toHaveLength(1);
  });

  it("accepts with the matching verified account, idempotently", async () => {
    const { org, owner } = await makeOrg({ name: "Brand Co" });
    const invitee = await makeUser({ email: "join@example.test" });
    await signInAs(owner.id);
    const token = tokenFrom((await invite(org.slug, "join@example.test")).inviteUrl);

    const view = await findInvitationByToken(token);
    expect(view).toMatchObject({ orgName: "Brand Co", role: "member", status: "pending" });

    await signInAs(invitee.id);
    expect(await acceptInvitation(token)).toMatchObject({ ok: true, data: { slug: org.slug } });
    expect(await acceptInvitation(token)).toMatchObject({ ok: true, data: { slug: org.slug } });
    const db = await getDb();
    const rows = await db.select().from(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, invitee.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("member");
    const [inv] = await db.select().from(invitations);
    expect(inv).toMatchObject({ status: "accepted", acceptedUserId: invitee.id });
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "member.invite_accept"))).toHaveLength(1);

    // An accepted link is no longer valid for anyone else.
    const other = await makeUser();
    await signInAs(other.id);
    expect(await acceptInvitation(token)).toMatchObject({ ok: false, code: "not_found" });
  });

  it("keeps an existing membership's role when the invitee is already a member", async () => {
    const primary = await makeUser();
    const { org } = await makeOrg({ owner: primary });
    await signInAs(primary.id);
    const token = tokenFrom((await invite(org.slug, "later@example.test", "owner")).inviteUrl);
    const user = await addMember(org.id, "member", await makeUser({ email: "later@example.test" }));
    await signInAs(user.id);
    expect(await acceptInvitation(token)).toMatchObject({ ok: true });
    const db = await getDb();
    const [row] = await db.select().from(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)));
    expect(row.role).toBe("member");
  });

  it("refuses the wrong account, unverified accounts, and signed-out callers", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const token = tokenFrom((await invite(org.slug, "jordan@example.test")).inviteUrl);

    const wrong = await makeUser({ email: "someone@example.test" });
    await signInAs(wrong.id);
    const refused = await acceptInvitation(token);
    expect(refused).toMatchObject({ ok: false, code: "forbidden" });
    if (!refused.ok) expect(refused.error).toContain("j•••n@example.test");

    const unverified = await makeUser({ email: "jordan@example.test", emailVerifiedAt: null });
    await signInAs(unverified.id);
    expect(await acceptInvitation(token)).toMatchObject({ ok: false, code: "requires_verified_email" });

    resetRequestContext();
    expect(await acceptInvitation(token)).toMatchObject({ ok: false, code: "forbidden" });
    expect(await acceptInvitation("not-a-real-token")).toMatchObject({ ok: false });
  });

  it("refuses expired and revoked invitations, and renewal issues a new working link", async () => {
    const { org, owner } = await makeOrg();
    const invitee = await makeUser({ email: "late@example.test" });
    await signInAs(owner.id);
    const first = tokenFrom((await invite(org.slug, "late@example.test")).inviteUrl);
    const db = await getDb();
    const [row] = await db.select().from(invitations);

    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.id, row.id));
    expect(await findInvitationByToken(first)).toBeNull();
    const ctx = await requireOrgAction(org.slug);
    expect((await listInvitations(ctx, {})).rows[0].status).toBe("expired");
    await signInAs(invitee.id);
    expect(await acceptInvitation(first)).toMatchObject({ ok: false, code: "not_found" });

    await signInAs(owner.id);
    const renewed = await renewInvitation(org.slug, { id: row.id });
    expect(renewed.ok).toBe(true);
    const second = tokenFrom(renewed.ok ? renewed.data.inviteUrl : undefined);
    expect(second).not.toBe(first);
    expect(await findInvitationByToken(first)).toBeNull();
    expect(await findInvitationByToken(second)).not.toBeNull();

    expect(await revokeInvitation(org.slug, { id: row.id })).toMatchObject({ ok: true });
    expect(await findInvitationByToken(second)).toBeNull();
    expect((await listInvitations(await requireOrgAction(org.slug), {})).rows[0].status).toBe("revoked");
    await signInAs(invitee.id);
    expect(await acceptInvitation(second)).toMatchObject({ ok: false, code: "not_found" });
    expect(await db.select().from(invitations)).toHaveLength(1);
  });

  it("does not let another org's owner revoke or renew an invitation", async () => {
    const { org, owner } = await makeOrg();
    const { org: other, owner: otherOwner } = await makeOrg();
    await signInAs(owner.id);
    await invite(org.slug, "x@example.test");
    const db = await getDb();
    const [row] = await db.select().from(invitations);

    await signInAs(otherOwner.id);
    expect(await revokeInvitation(other.slug, { id: row.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await renewInvitation(other.slug, { id: row.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await revokeInvitation(org.slug, { id: row.id })).toMatchObject({ ok: false, code: "not_found" });
    const [still] = await db.select().from(invitations);
    expect(still.status).toBe("pending");
  });

  it("masks emails", () => {
    expect(maskEmail("jordan@example.test")).toBe("j•••n@example.test");
    expect(maskEmail("ab@x.io")).toBe("a•••@x.io");
  });
});
