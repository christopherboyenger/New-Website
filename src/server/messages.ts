"use server";

/**
 * Messages dock Server Actions (L01/L09, evidence audit item 1).
 *
 * Only the workspace "Team" channel is functional: one persisted conversation
 * per organization, readable and writable by its members. Support, AI-agent
 * and creator channels need services this deployment does not have, so the
 * dock shows them as unavailable and nothing here fabricates their messages.
 *
 * Every action re-authorizes with requireOrgAction(slug, "messages:use") and
 * qualifies every query with the authorized orgId; conversation IDs from the
 * client only select within that organization.
 */
import "server-only";
import { and, count, desc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/ids";
import { fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { NotFoundError, requireOrgAction, type OrgContext } from "./authz";
import { getDb } from "./db/client";
import { conversationReads, conversations, memberships, messages, users, userFlags } from "./db/schema";
import { consumeRateLimit } from "./rate-limit";

const MESSAGE_MAX_LENGTH = 2000;
const PAGE_SIZE = 50;
/** Sends per user per minute; generous for conversation, low enough to stop floods. */
const SEND_LIMIT_PER_MINUTE = 30;

export interface MessageView {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  mine: boolean;
}

export interface MessagePage {
  conversationId: string;
  /** Oldest first. */
  messages: MessageView[];
  /** Whether older messages exist before the first one returned. */
  hasEarlier: boolean;
}

export interface TeamConversationView extends MessagePage {
  title: string;
  maxLength: number;
}

const conversationIdSchema = z.string().trim().min(1).max(100);
const listSchema = z.object({
  conversationId: conversationIdSchema,
  /** ISO timestamp: return messages strictly older than this (for "Load earlier messages"). */
  before: z.iso.datetime().optional(),
});
const sendSchema = z.object({
  conversationId: conversationIdSchema,
  body: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, "Write a message first.")
        .max(MESSAGE_MAX_LENGTH, `Messages can be up to ${MESSAGE_MAX_LENGTH.toLocaleString("en-US")} characters.`),
    ),
});
const readSchema = z.object({ conversationId: conversationIdSchema, through: z.iso.datetime() });
const dockStateSchema = z.enum(["minimized", "floating", "docked"]);

/** One team conversation per organization; the deterministic key makes lazy creation idempotent under concurrency. */
function teamConversationId(orgId: string): string {
  return `cnv_team_${orgId}`;
}

async function teamConversationFor(ctx: OrgContext, conversationId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, ctx.org.id), eq(conversations.kind, "team")))
    .limit(1);
  if (!row) throw new NotFoundError("Conversation not found.");
  return row;
}

function displayName(firstName: string | null, lastName: string | null, email: string | null): string {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  if (name) return name;
  return email ? email.split("@")[0] : "Former teammate";
}

async function readMessages(ctx: OrgContext, conversationId: string, before?: string): Promise<MessagePage> {
  const db = await getDb();
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      authorUserId: messages.authorUserId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorUserId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.orgId, ctx.org.id),
        before ? lt(messages.createdAt, new Date(before)) : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(PAGE_SIZE + 1);
  const hasEarlier = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE).reverse();
  return {
    conversationId,
    hasEarlier,
    messages: page.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      authorName: displayName(m.firstName, m.lastName, m.email),
      mine: m.authorUserId === ctx.user.id,
    })),
  };
}

/**
 * Opens the workspace Team channel, creating its conversation on first use,
 * and returns the latest messages.
 */
export async function openTeamConversationAction(orgSlug: string): Promise<ActionResult<TeamConversationView>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(orgSlug, "messages:use");
    const db = await getDb();
    const id = teamConversationId(ctx.org.id);
    await db.insert(conversations).values({ id, orgId: ctx.org.id, kind: "team", title: "Team" }).onConflictDoNothing({ target: conversations.id });
    const conversation = await teamConversationFor(ctx, id);
    const page = await readMessages(ctx, conversation.id);
    return ok({ ...page, title: conversation.title, maxLength: MESSAGE_MAX_LENGTH });
  });
}

/** Latest messages (refresh/poll), or the page before `before` (load earlier). */
export async function listTeamMessagesAction(orgSlug: string, input: z.input<typeof listSchema>): Promise<ActionResult<MessagePage>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(orgSlug, "messages:use");
    const parsed = listSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const conversation = await teamConversationFor(ctx, parsed.data.conversationId);
    return ok(await readMessages(ctx, conversation.id, parsed.data.before));
  });
}

export async function sendTeamMessageAction(orgSlug: string, input: z.input<typeof sendSchema>): Promise<ActionResult<MessageView>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(orgSlug, "messages:use");
    const parsed = sendSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error, parsed.error.issues[0]?.message ?? "Check your message.");
    const conversation = await teamConversationFor(ctx, parsed.data.conversationId);
    const limit = await consumeRateLimit(`messages:send:${ctx.user.id}`, SEND_LIMIT_PER_MINUTE, 60);
    if (!limit.allowed) return fail("You're sending messages very quickly. Wait a moment, then try again.", "rate_limited");

    const db = await getDb();
    const now = new Date();
    const message = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(messages)
        .values({ id: newId("msg"), conversationId: conversation.id, orgId: ctx.org.id, authorUserId: ctx.user.id, body: parsed.data.body, createdAt: now })
        .returning();
      await tx.update(conversations).set({ lastMessageAt: now }).where(and(eq(conversations.id, conversation.id), eq(conversations.orgId, ctx.org.id)));
      // The author has read everything up to their own message.
      await tx
        .insert(conversationReads)
        .values({ conversationId: conversation.id, userId: ctx.user.id, lastReadAt: now })
        .onConflictDoUpdate({
          target: [conversationReads.conversationId, conversationReads.userId],
          set: { lastReadAt: sql`greatest(${conversationReads.lastReadAt}, excluded.last_read_at)` },
        });
      return row;
    });
    return ok({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      authorName: displayName(ctx.user.firstName, ctx.user.lastName, ctx.user.email),
      mine: true,
    });
  });
}

/** Marks the conversation read up to `through` (the newest message the user has seen). Never moves backwards. */
export async function markConversationReadAction(orgSlug: string, input: z.input<typeof readSchema>): Promise<ActionResult<{ unread: number }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(orgSlug, "messages:use");
    const parsed = readSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const conversation = await teamConversationFor(ctx, parsed.data.conversationId);
    const now = new Date();
    const through = new Date(Math.min(new Date(parsed.data.through).getTime(), now.getTime()));
    const db = await getDb();
    await db
      .insert(conversationReads)
      .values({ conversationId: conversation.id, userId: ctx.user.id, lastReadAt: through })
      .onConflictDoUpdate({
        target: [conversationReads.conversationId, conversationReads.userId],
        set: { lastReadAt: sql`greatest(${conversationReads.lastReadAt}, excluded.last_read_at)` },
      });
    return ok({ unread: await unreadCount(ctx) });
  });
}

/**
 * Unread team messages for the current user: messages from others after the
 * user's last read position (or after they joined, if they never opened it).
 */
async function unreadCount(ctx: OrgContext): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.orgId, ctx.org.id), eq(conversations.kind, "team")))
    .innerJoin(memberships, and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, ctx.user.id)))
    .leftJoin(conversationReads, and(eq(conversationReads.conversationId, conversations.id), eq(conversationReads.userId, ctx.user.id)))
    .where(
      and(
        eq(messages.orgId, ctx.org.id),
        or(isNull(messages.authorUserId), ne(messages.authorUserId, ctx.user.id)),
        gt(messages.createdAt, sql`coalesce(${conversationReads.lastReadAt}, ${memberships.joinedAt})`),
      ),
    );
  return row?.n ?? 0;
}

export async function getUnreadMessageCountAction(orgSlug: string): Promise<ActionResult<{ unread: number }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(orgSlug, "messages:use");
    return ok({ unread: await unreadCount(ctx) });
  });
}

/** Persists the dock presentation (minimized / floating window / docked side panel) for the current user. */
export async function setMessagesDockStateAction(orgSlug: string, state: z.input<typeof dockStateSchema>): Promise<ActionResult<{ state: z.output<typeof dockStateSchema> }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(orgSlug, "messages:use");
    const parsed = dockStateSchema.safeParse(state);
    if (!parsed.success) return fail("Unknown messages layout.");
    const db = await getDb();
    await db
      .insert(userFlags)
      .values({ userId: ctx.user.id, messagesDockState: parsed.data })
      .onConflictDoUpdate({ target: userFlags.userId, set: { messagesDockState: parsed.data } });
    return ok({ state: parsed.data });
  });
}
