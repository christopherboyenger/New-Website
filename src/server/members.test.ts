import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeOrg, makeUser } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { hashPassword } from "./auth/password";
import { requireOrgAction } from "./authz";
import { getDb } from "./db/client";
import { auditLog, memberships, organizations, sessions } from "./db/schema";
import { changeMemberRole, leaveWorkspace, listTeamMembers, listTransferCandidates, removeMember, transferOwnership } from "./members";

async function membershipOf(orgId: string, userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  return row ?? null;
}

describe("team members", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("lists members with roles, badges and per-row permissions, searchable", async () => {
    const primary = await makeUser({ firstName: "Pat", lastName: "Primary" });
    const { org } = await makeOrg({ owner: primary });
    const owner = await addMember(org.id, "owner", await makeUser({ firstName: "Olive", lastName: "Owner" }));
    const member = await addMember(org.id, "member", await makeUser({ firstName: "Max", lastName: "Member", email: "max@example.test" }));

    await signInAs(owner.id);
    const ctx = await requireOrgAction(org.slug);
    const page = await listTeamMembers(ctx, {});
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => [r.name, r.role, r.isPrimaryOwner, r.isYou, r.canManage])).toEqual([
      ["Pat Primary", "owner", true, false, false],
      ["Olive Owner", "owner", false, true, false],
      ["Max Member", "member", false, false, true],
    ]);
    expect(page.rows[2].roleOptions).toEqual(["member"]);
    expect((await listTeamMembers(ctx, { query: "max@" })).rows.map((r) => r.userId)).toEqual([member.id]);
    expect((await listTeamMembers(ctx, { query: "olive own" })).rows.map((r) => r.userId)).toEqual([owner.id]);
    expect((await listTeamMembers(ctx, { query: "%" })).total).toBe(0);
  });

  it("enforces the management matrix", async () => {
    const primary = await makeUser();
    const { org } = await makeOrg({ owner: primary });
    const ownerA = await addMember(org.id, "owner");
    const ownerB = await addMember(org.id, "owner");
    const memberA = await addMember(org.id, "member");
    const memberB = await addMember(org.id, "member");

    // Owner removes a member.
    await signInAs(ownerA.id);
    expect(await removeMember(org.slug, { userId: memberA.id })).toMatchObject({ ok: true });
    expect(await membershipOf(org.id, memberA.id)).toBeNull();
    // Owner cannot remove another owner, the primary owner, or themselves.
    expect(await removeMember(org.slug, { userId: ownerB.id })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await removeMember(org.slug, { userId: primary.id })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await removeMember(org.slug, { userId: ownerA.id })).toMatchObject({ ok: false, code: "forbidden" });
    // Owner cannot promote to Owner.
    expect(await changeMemberRole(org.slug, { userId: memberB.id, role: "owner" })).toMatchObject({ ok: false, code: "forbidden" });

    // Member cannot manage anyone.
    await signInAs(memberB.id);
    expect(await removeMember(org.slug, { userId: memberB.id })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await changeMemberRole(org.slug, { userId: ownerA.id, role: "member" })).toMatchObject({ ok: false, code: "forbidden" });

    // Primary owner can demote and remove owners, and promote members.
    await signInAs(primary.id);
    expect(await changeMemberRole(org.slug, { userId: memberB.id, role: "owner" })).toMatchObject({ ok: true, data: { role: "owner" } });
    expect(await changeMemberRole(org.slug, { userId: ownerA.id, role: "member" })).toMatchObject({ ok: true });
    expect(await removeMember(org.slug, { userId: ownerB.id })).toMatchObject({ ok: true });
    expect((await membershipOf(org.id, memberB.id))?.role).toBe("owner");
    // Nobody changes or removes the primary owner, including themselves.
    expect(await removeMember(org.slug, { userId: primary.id })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await changeMemberRole(org.slug, { userId: primary.id, role: "member" })).toMatchObject({ ok: false, code: "forbidden" });

    // Users of another workspace look like nonexistent ones.
    const stranger = await makeUser();
    expect(await removeMember(org.slug, { userId: stranger.id })).toMatchObject({ ok: false, code: "not_found" });

    const db = await getDb();
    const actions = (await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.orgId, org.id))).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["member.remove", "member.role_change"]));
  });

  it("revokes access immediately on removal", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org.id, "member");
    await signInAs(owner.id);
    await removeMember(org.slug, { userId: member.id });
    await signInAs(member.id);
    await expect(requireOrgAction(org.slug)).rejects.toThrow("Workspace not found.");
  });

  it("transfers primary ownership only to an existing Owner, with the password", async () => {
    const primary = await makeUser({ passwordHash: await hashPassword("correct horse battery") });
    const { org } = await makeOrg({ owner: primary });
    const owner = await addMember(org.id, "owner");
    const member = await addMember(org.id, "member");

    // Only the primary owner can transfer.
    await signInAs(owner.id);
    expect(await transferOwnership(org.slug, { userId: owner.id, password: "x" })).toMatchObject({ ok: false, code: "forbidden" });

    await signInAs(primary.id);
    const ctx = await requireOrgAction(org.slug);
    expect((await listTransferCandidates(ctx)).map((c) => c.userId)).toEqual([owner.id]);
    expect(await transferOwnership(org.slug, { userId: member.id, password: "correct horse battery" })).toMatchObject({ ok: false, code: "validation" });
    expect(await transferOwnership(org.slug, { userId: primary.id, password: "correct horse battery" })).toMatchObject({ ok: false, code: "validation" });

    const db = await getDb();
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db.update(sessions).set({ recentAuthAt: stale }).where(eq(sessions.userId, primary.id));
    expect(await transferOwnership(org.slug, { userId: owner.id, password: "wrong password" })).toMatchObject({ ok: false, code: "requires_recent_auth" });
    const [unchanged] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(unchanged.primaryOwnerUserId).toBe(primary.id);

    expect(await transferOwnership(org.slug, { userId: owner.id, password: "correct horse battery" })).toMatchObject({ ok: true });
    const [after] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(after.primaryOwnerUserId).toBe(owner.id);
    expect((await membershipOf(org.id, primary.id))?.role).toBe("owner");
    const [session] = await db.select().from(sessions).where(eq(sessions.userId, primary.id));
    expect(session.recentAuthAt.getTime()).toBeGreaterThan(stale.getTime());
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.orgId, org.id), eq(auditLog.action, "ownership.transfer")));
    expect(audit).toMatchObject({ actorUserId: primary.id, targetId: owner.id });

    // The former primary owner is now an ordinary Owner and can no longer transfer.
    expect(await transferOwnership(org.slug, { userId: owner.id, password: "correct horse battery" })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("lets non-primary members leave, but not the primary owner", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org.id, "member");
    await signInAs(owner.id);
    expect(await leaveWorkspace(org.slug)).toMatchObject({ ok: false, code: "forbidden" });
    await signInAs(member.id);
    expect(await leaveWorkspace(org.slug)).toMatchObject({ ok: true });
    expect(await membershipOf(org.id, member.id)).toBeNull();
    expect(await leaveWorkspace(org.slug)).toMatchObject({ ok: false, code: "not_found" });
  });
});
