import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeOrg, makeUser } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import {
  authenticateApiToken,
  createApiGrant,
  grantHasScope,
  LAST_USED_THROTTLE_MS,
  listApiGrants,
  MAX_ACTIVE_GRANTS_PER_ORG,
  parseBearer,
  revokeApiGrant,
} from "./api-grants";
import { tokenDigest } from "./crypto";
import { getDb } from "./db/client";
import { apiGrants, auditLog, memberships, sessions, users } from "./db/schema";

async function staleRecentAuth(userId: string) {
  const db = await getDb();
  await db.update(sessions).set({ recentAuthAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }).where(eq(sessions.userId, userId));
}

async function create(slug: string, overrides: Record<string, unknown> = {}) {
  const result = await createApiGrant(slug, { label: "Warehouse", scopes: ["reports:read"], expiry: "90", ...overrides });
  if (!result.ok) throw new Error(`create failed: ${result.error}`);
  return result.data;
}

describe("API grants", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("returns the token once and stores only its keyed digest and public prefix", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const { token, grant } = await create(org.slug, { scopes: ["reports:read", "campaigns:read", "reports:read"] });

    expect(token).toMatch(/^rk_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
    expect(token.startsWith(grant.tokenPrefix + "_")).toBe(true);
    expect(grant.scopes).toEqual(["reports:read", "campaigns:read"]);

    const db = await getDb();
    const [row] = await db.select().from(apiGrants).where(eq(apiGrants.id, grant.id));
    expect(row.tokenDigest).toBe(tokenDigest(token, "api_grant"));
    expect(JSON.stringify(row)).not.toContain(token);
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "api_grant.create"));
    expect(JSON.stringify(audit)).not.toContain(token);

    // Listing never exposes the token or its digest.
    const listed = await listApiGrants(org.id);
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(JSON.stringify(listed)).not.toContain(row.tokenDigest);
    expect(listed[0]).toMatchObject({ label: "Warehouse", status: "active", lastUsedAt: null });
  });

  it("authenticates a bearer token to its org and checks scopes", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const { token } = await create(org.slug);

    const auth = await authenticateApiToken(`Bearer ${token}`);
    expect(auth?.org).toEqual({ id: org.id, slug: org.slug });
    expect(grantHasScope(auth!.grant, "reports:read")).toBe(true);
    expect(grantHasScope(auth!.grant, "campaigns:read")).toBe(false);

    expect(await authenticateApiToken(null)).toBeNull();
    expect(await authenticateApiToken(token)).toBeNull();
    expect(await authenticateApiToken(`Bearer ${token}x`)).toBeNull();
    expect(await authenticateApiToken(`Basic ${token}`)).toBeNull();
    expect(parseBearer(`Bearer  ${token} `)).toBe(token);
    expect(parseBearer("Bearer a b")).toBeNull();
  });

  it("rejects revoked and expired tokens", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const revoked = await create(org.slug, { label: "Old" });
    const expiring = await create(org.slug, { expiry: "30" });

    expect(await revokeApiGrant(org.slug, { id: revoked.grant.id })).toMatchObject({ ok: true });
    expect(await authenticateApiToken(`Bearer ${revoked.token}`)).toBeNull();
    // Revoking twice is a not-found, not a second success.
    expect(await revokeApiGrant(org.slug, { id: revoked.grant.id })).toMatchObject({ ok: false, code: "not_found" });

    expect(await authenticateApiToken(`Bearer ${expiring.token}`)).not.toBeNull();
    expect(await authenticateApiToken(`Bearer ${expiring.token}`, new Date(Date.now() + 31 * 86_400_000))).toBeNull();
    const statuses = Object.fromEntries((await listApiGrants(org.id, new Date(Date.now() + 31 * 86_400_000))).map((g) => [g.label, g.status]));
    expect(statuses).toEqual({ Old: "revoked", Warehouse: "expired" });
  });

  it("stops a token when its creator loses owner access or is disabled", async () => {
    const { org } = await makeOrg();
    const coOwner = await addMember(org.id, "owner");
    await signInAs(coOwner.id);
    const { token } = await create(org.slug);
    expect(await authenticateApiToken(`Bearer ${token}`)).not.toBeNull();

    const db = await getDb();
    await db.update(memberships).set({ role: "member" }).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, coOwner.id)));
    expect(await authenticateApiToken(`Bearer ${token}`)).toBeNull();

    await db.update(memberships).set({ role: "owner" }).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, coOwner.id)));
    expect(await authenticateApiToken(`Bearer ${token}`)).not.toBeNull();
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, coOwner.id));
    expect(await authenticateApiToken(`Bearer ${token}`)).toBeNull();
  });

  it("throttles lastUsedAt writes", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const { token, grant } = await create(org.slug);
    const db = await getDb();
    const lastUsed = async () => (await db.select({ at: apiGrants.lastUsedAt }).from(apiGrants).where(eq(apiGrants.id, grant.id)))[0].at;

    const t0 = new Date();
    await authenticateApiToken(`Bearer ${token}`, t0);
    expect((await lastUsed())?.getTime()).toBe(t0.getTime());
    await authenticateApiToken(`Bearer ${token}`, new Date(t0.getTime() + 1000));
    expect((await lastUsed())?.getTime()).toBe(t0.getTime());
    const later = new Date(t0.getTime() + LAST_USED_THROTTLE_MS + 1000);
    await authenticateApiToken(`Bearer ${token}`, later);
    expect((await lastUsed())?.getTime()).toBe(later.getTime());
  });

  it("is owner-only and needs recent authentication and a verified email", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org.id, "member");
    const { org: otherOrg } = await makeOrg();

    await signInAs(member.id);
    expect(await createApiGrant(org.slug, { label: "x", scopes: ["reports:read"], expiry: "30" })).toMatchObject({ ok: false, code: "forbidden" });

    await signInAs(owner.id);
    // Another org's slug looks like it doesn't exist.
    expect(await createApiGrant(otherOrg.slug, { label: "x", scopes: ["reports:read"], expiry: "30" })).toMatchObject({ ok: false, code: "not_found" });

    await staleRecentAuth(owner.id);
    expect(await createApiGrant(org.slug, { label: "x", scopes: ["reports:read"], expiry: "30" })).toMatchObject({ ok: false, code: "requires_recent_auth" });

    const unverified = await makeUser({ emailVerifiedAt: null });
    await addMember(org.id, "owner", unverified);
    await signInAs(unverified.id);
    expect(await createApiGrant(org.slug, { label: "x", scopes: ["reports:read"], expiry: "30" })).toMatchObject({ ok: false, code: "requires_verified_email" });

    const db = await getDb();
    expect(await db.select().from(apiGrants)).toHaveLength(0);
  });

  it("validates input and cannot revoke another org's token", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    expect(await createApiGrant(org.slug, { label: " ", scopes: [], expiry: "7" })).toMatchObject({
      ok: false,
      code: "validation",
      fieldErrors: { label: expect.any(String), scopes: expect.any(String), expiry: expect.any(String) },
    });
    expect(await createApiGrant(org.slug, { label: "x", scopes: ["billing:write"], expiry: "30" })).toMatchObject({ ok: false, code: "validation" });

    const other = await makeOrg();
    await signInAs(other.owner.id);
    const foreign = await create(other.org.slug);
    await signInAs(owner.id);
    expect(await revokeApiGrant(org.slug, { id: foreign.grant.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await authenticateApiToken(`Bearer ${foreign.token}`)).not.toBeNull();
  });

  it("caps active tokens per org", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    for (let i = 0; i < MAX_ACTIVE_GRANTS_PER_ORG; i++) await create(org.slug, { label: `t${i}` });
    expect(await createApiGrant(org.slug, { label: "one more", scopes: ["reports:read"], expiry: "30" })).toMatchObject({ ok: false, code: "conflict" });
  });
});
