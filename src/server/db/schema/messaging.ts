import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Persisted conversations. Only "team" channels (members of the same org) are
 * functional without further provisioning; support and AI-agent channels
 * require configured services and are never populated with fake messages.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["team", "creator", "support", "agent"] }).notNull(),
    title: text("title").notNull(),
    creatorId: text("creator_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastMessageAt: ts("last_message_at"),
  },
  (t) => [index("conversations_org_idx").on(t.orgId)],
);

export const conversationReads = pgTable(
  "conversation_reads",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    authorUserId: text("author_user_id").references(() => users.id),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);
