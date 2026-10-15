import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/support/db";
import { addMember, makeOrg, makeUser } from "../../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../../tests/support/request-context";
import { getDb } from "@/server/db/client";
import { userFlags } from "@/server/db/schema";
import { setSidebarCollapsedAction } from "./shell-actions";

async function flagsFor(userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(userFlags).where(eq(userFlags.userId, userId));
  return row;
}

describe("sidebar collapse preference", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("persists per user, for owners and members alike", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org.id, "member");

    await signInAs(member.id);
    expect(await setSidebarCollapsedAction(org.slug, true)).toMatchObject({ ok: true, data: { collapsed: true } });
    expect((await flagsFor(member.id)).sidebarCollapsed).toBe(true);
    expect((await flagsFor(owner.id))?.sidebarCollapsed ?? false).toBe(false);

    expect(await setSidebarCollapsedAction(org.slug, false)).toMatchObject({ ok: true, data: { collapsed: false } });
    expect((await flagsFor(member.id)).sidebarCollapsed).toBe(false);
  });

  it("keeps the other shell preferences when it writes", async () => {
    const { org, owner } = await makeOrg();
    const db = await getDb();
    await db.insert(userFlags).values({ userId: owner.id, lastOrgId: org.id, messagesDockState: "docked" }).onConflictDoUpdate({
      target: userFlags.userId,
      set: { lastOrgId: org.id, messagesDockState: "docked" },
    });
    await signInAs(owner.id);
    await setSidebarCollapsedAction(org.slug, true);
    expect(await flagsFor(owner.id)).toMatchObject({ lastOrgId: org.id, messagesDockState: "docked", sidebarCollapsed: true });
  });

  it("rejects non-boolean input and outsiders", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    expect(await setSidebarCollapsedAction(org.slug, "yes" as unknown as boolean)).toMatchObject({ ok: false, code: "validation" });

    const outsider = await makeUser();
    await signInAs(outsider.id);
    expect(await setSidebarCollapsedAction(org.slug, true)).toMatchObject({ ok: false, code: "not_found" });
    expect(await flagsFor(outsider.id)).toBeUndefined();

    resetRequestContext();
    expect(await setSidebarCollapsedAction(org.slug, true)).toMatchObject({ ok: false, code: "not_found" });
  });
});
