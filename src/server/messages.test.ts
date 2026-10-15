import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeOrg, makeUser } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { getDb } from "./db/client";
import { memberships, messages, userFlags } from "./db/schema";
import {
  getUnreadMessageCountAction,
  listTeamMessagesAction,
  markConversationReadAction,
  openTeamConversationAction,
  sendTeamMessageAction,
  setMessagesDockStateAction,
} from "./messages";

async function openAs(userId: string, slug: string) {
  await signInAs(userId);
  const res = await openTeamConversationAction(slug);
  if (!res.ok) throw new Error(`open failed: ${res.error}`);
  return res.data;
}

describe("team messages", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("creates the team conversation lazily and once, then lets members exchange plain-text messages", async () => {
    const owner = await makeUser({ firstName: "Robin", lastName: "Ames" });
    const { org } = await makeOrg({ owner, name: "Brand" });
    const member = await addMember(org.id, "member");

    const first = await openAs(owner.id, org.slug);
    expect(first).toMatchObject({ title: "Team", messages: [], hasEarlier: false, maxLength: 2000 });
    const again = await openAs(owner.id, org.slug);
    expect(again.conversationId).toBe(first.conversationId);

    const html = "<img src=x onerror=alert(1)> **hi**\r\nsecond line";
    const sent = await sendTeamMessageAction(org.slug, { conversationId: first.conversationId, body: `  ${html}  ` });
    expect(sent.ok).toBe(true);
    if (sent.ok) expect(sent.data).toMatchObject({ body: "<img src=x onerror=alert(1)> **hi**\nsecond line", mine: true });

    const asMember = await openAs(member.id, org.slug);
    expect(asMember.conversationId).toBe(first.conversationId);
    expect(asMember.messages).toHaveLength(1);
    expect(asMember.messages[0]).toMatchObject({ mine: false, authorName: "Robin Ames" });

    const reply = await sendTeamMessageAction(org.slug, { conversationId: asMember.conversationId, body: "Hello back" });
    expect(reply.ok).toBe(true);
    const list = await listTeamMessagesAction(org.slug, { conversationId: asMember.conversationId });
    expect(list.ok && list.data.messages.map((m) => m.body)).toEqual(["<img src=x onerror=alert(1)> **hi**\nsecond line", "Hello back"]);
  });

  it("rejects empty and over-long messages without storing them", async () => {
    const { org, owner } = await makeOrg();
    const { conversationId } = await openAs(owner.id, org.slug);

    const blank = await sendTeamMessageAction(org.slug, { conversationId, body: "   \n  " });
    expect(blank).toMatchObject({ ok: false, code: "validation", error: "Write a message first." });
    const tooLong = await sendTeamMessageAction(org.slug, { conversationId, body: "x".repeat(2001) });
    expect(tooLong).toMatchObject({ ok: false, code: "validation" });
    if (!tooLong.ok) expect(tooLong.fieldErrors?.body).toMatch(/2,000 characters/);
    const atLimit = await sendTeamMessageAction(org.slug, { conversationId, body: "x".repeat(2000) });
    expect(atLimit.ok).toBe(true);

    const db = await getDb();
    expect(await db.select().from(messages)).toHaveLength(1);
  });

  it("does not let non-members or signed-out users read or post", async () => {
    const { org, owner } = await makeOrg();
    const outsider = await makeUser();
    const { conversationId } = await openAs(owner.id, org.slug);
    await sendTeamMessageAction(org.slug, { conversationId, body: "Internal note" });

    await signInAs(outsider.id);
    expect(await openTeamConversationAction(org.slug)).toMatchObject({ ok: false, code: "not_found" });
    expect(await listTeamMessagesAction(org.slug, { conversationId })).toMatchObject({ ok: false, code: "not_found" });
    expect(await sendTeamMessageAction(org.slug, { conversationId, body: "hi" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await getUnreadMessageCountAction(org.slug)).toMatchObject({ ok: false, code: "not_found" });

    resetRequestContext();
    expect(await listTeamMessagesAction(org.slug, { conversationId })).toMatchObject({ ok: false, code: "not_found" });

    const db = await getDb();
    expect((await db.select().from(messages)).map((m) => m.body)).toEqual(["Internal note"]);
  });

  it("never reaches another organization's conversation through a member's own workspace", async () => {
    const { org: a, owner: ownerA } = await makeOrg();
    const { org: b, owner: ownerB } = await makeOrg();
    const convA = await openAs(ownerA.id, a.slug);
    await sendTeamMessageAction(a.slug, { conversationId: convA.conversationId, body: "Secret plan" });

    await openAs(ownerB.id, b.slug);
    expect(await listTeamMessagesAction(b.slug, { conversationId: convA.conversationId })).toMatchObject({ ok: false, code: "not_found" });
    expect(await sendTeamMessageAction(b.slug, { conversationId: convA.conversationId, body: "intrusion" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await markConversationReadAction(b.slug, { conversationId: convA.conversationId, through: new Date().toISOString() })).toMatchObject({
      ok: false,
      code: "not_found",
    });
    const unreadB = await getUnreadMessageCountAction(b.slug);
    expect(unreadB).toEqual({ ok: true, data: { unread: 0 }, message: undefined });
  });

  it("keeps a user who belongs to two workspaces inside the workspace named by the slug", async () => {
    const { org: a, owner } = await makeOrg();
    const { org: b } = await makeOrg();
    await addMember(b.id, "member", owner);
    const convA = await openAs(owner.id, a.slug);
    const convB = await openAs(owner.id, b.slug);
    expect(convA.conversationId).not.toBe(convB.conversationId);
    await sendTeamMessageAction(b.slug, { conversationId: convB.conversationId, body: "Only for B" });

    expect(await listTeamMessagesAction(a.slug, { conversationId: convB.conversationId })).toMatchObject({ ok: false, code: "not_found" });
    expect(await sendTeamMessageAction(a.slug, { conversationId: convB.conversationId, body: "cross-post" })).toMatchObject({ ok: false, code: "not_found" });
    const listA = await listTeamMessagesAction(a.slug, { conversationId: convA.conversationId });
    expect(listA.ok && listA.data.messages).toEqual([]);
  });

  it("counts unread messages from others since the last read position, never the user's own", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org.id, "member");
    const db = await getDb();
    // The member joined before any message was written.
    await db.update(memberships).set({ joinedAt: new Date(Date.now() - 60_000) }).where(eq(memberships.userId, member.id));

    const { conversationId } = await openAs(owner.id, org.slug);
    await sendTeamMessageAction(org.slug, { conversationId, body: "One" });
    await sendTeamMessageAction(org.slug, { conversationId, body: "Two" });
    expect(await getUnreadMessageCountAction(org.slug)).toMatchObject({ ok: true, data: { unread: 0 } });

    await signInAs(member.id);
    expect(await getUnreadMessageCountAction(org.slug)).toMatchObject({ ok: true, data: { unread: 2 } });
    const page = await listTeamMessagesAction(org.slug, { conversationId });
    if (!page.ok) throw new Error(page.error);
    const firstSeen = page.data.messages[0].createdAt;
    expect(await markConversationReadAction(org.slug, { conversationId, through: firstSeen })).toMatchObject({ ok: true, data: { unread: 1 } });
    const lastSeen = page.data.messages[1].createdAt;
    expect(await markConversationReadAction(org.slug, { conversationId, through: lastSeen })).toMatchObject({ ok: true, data: { unread: 0 } });
    // Marking an older position never moves the read marker backwards.
    expect(await markConversationReadAction(org.slug, { conversationId, through: firstSeen })).toMatchObject({ ok: true, data: { unread: 0 } });
    // Sending marks your own position read.
    await signInAs(owner.id);
    await sendTeamMessageAction(org.slug, { conversationId, body: "Three" });
    await signInAs(member.id);
    await sendTeamMessageAction(org.slug, { conversationId, body: "Reply" });
    expect(await getUnreadMessageCountAction(org.slug)).toMatchObject({ ok: true, data: { unread: 0 } });
  });

  it("does not count history from before a teammate joined as unread", async () => {
    const { org, owner } = await makeOrg();
    const { conversationId } = await openAs(owner.id, org.slug);
    await sendTeamMessageAction(org.slug, { conversationId, body: "Before you joined" });
    const db = await getDb();
    const latecomer = await addMember(org.id, "member");
    await db.update(memberships).set({ joinedAt: new Date(Date.now() + 1_000) }).where(eq(memberships.userId, latecomer.id));
    await signInAs(latecomer.id);
    expect(await getUnreadMessageCountAction(org.slug)).toMatchObject({ ok: true, data: { unread: 0 } });
    const history = await listTeamMessagesAction(org.slug, { conversationId });
    expect(history.ok && history.data.messages).toHaveLength(1);
  });

  it("pages older messages with `before`", async () => {
    const { org, owner } = await makeOrg();
    const { conversationId } = await openAs(owner.id, org.slug);
    const db = await getDb();
    const base = Date.now() - 100_000;
    await db.insert(messages).values(
      Array.from({ length: 55 }, (_, i) => ({
        id: `msg_test_${String(i).padStart(3, "0")}`,
        conversationId,
        orgId: org.id,
        authorUserId: owner.id,
        body: `Message ${i}`,
        createdAt: new Date(base + i * 1_000),
      })),
    );
    const latest = await listTeamMessagesAction(org.slug, { conversationId });
    if (!latest.ok) throw new Error(latest.error);
    expect(latest.data.messages).toHaveLength(50);
    expect(latest.data.hasEarlier).toBe(true);
    expect(latest.data.messages[0].body).toBe("Message 5");
    expect(latest.data.messages.at(-1)?.body).toBe("Message 54");
    const earlier = await listTeamMessagesAction(org.slug, { conversationId, before: latest.data.messages[0].createdAt });
    expect(earlier.ok && earlier.data.messages.map((m) => m.body)).toEqual(["Message 0", "Message 1", "Message 2", "Message 3", "Message 4"]);
    expect(earlier.ok && earlier.data.hasEarlier).toBe(false);
  });

  it("rate-limits message floods", async () => {
    const { org, owner } = await makeOrg();
    const { conversationId } = await openAs(owner.id, org.slug);
    for (let i = 0; i < 30; i++) {
      const res = await sendTeamMessageAction(org.slug, { conversationId, body: `m${i}` });
      expect(res.ok).toBe(true);
    }
    expect(await sendTeamMessageAction(org.slug, { conversationId, body: "one too many" })).toMatchObject({ ok: false, code: "rate_limited" });
  });

  it("persists the dock presentation per user and rejects unknown states", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    expect(await setMessagesDockStateAction(org.slug, "docked")).toMatchObject({ ok: true, data: { state: "docked" } });
    expect(await setMessagesDockStateAction(org.slug, "maximized" as never)).toMatchObject({ ok: false, code: "validation" });
    const db = await getDb();
    const [flags] = await db.select().from(userFlags).where(eq(userFlags.userId, owner.id));
    expect(flags.messagesDockState).toBe("docked");

    const outsider = await makeUser();
    await signInAs(outsider.id);
    expect(await setMessagesDockStateAction(org.slug, "floating")).toMatchObject({ ok: false, code: "not_found" });
  });
});
