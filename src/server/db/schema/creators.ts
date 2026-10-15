import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { creatorLevels, platforms } from "@/domain/campaign";
import { campaigns, playbooks } from "./campaigns";
import { organizations, users } from "./core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const count = (name: string) => bigint(name, { mode: "number" });

/** A creator identity. Linked to a user account when the creator signs up through the creator portal. */
export const creators = pgTable(
  "creators",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    /** Level policy is a product decision; thresholds were not recovered from the reference. */
    level: text("level", { enum: creatorLevels }).notNull().default("bronze"),
    country: text("country"),
    avatarUrl: text("avatar_url"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("creators_user_unique").on(t.userId)],
);

export const socialAccountVerification = ["unverified", "pending", "verified", "failed"] as const;

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: platforms }).notNull(),
    handle: text("handle").notNull(),
    /** Provider's stable account ID, only set after ownership verification. */
    externalId: text("external_id"),
    verification: text("verification", { enum: socialAccountVerification }).notNull().default("unverified"),
    verifiedAt: ts("verified_at"),
    dedicated: boolean("dedicated").notNull().default(false),
    niche: text("niche"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("social_accounts_platform_handle_unique").on(t.platform, t.handle),
    index("social_accounts_creator_idx").on(t.creatorId),
  ],
);

/** Creator ↔ campaign admission (separate from post-content review). */
export const campaignMemberships = pgTable(
  "campaign_memberships",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    status: text("status", { enum: ["requested", "approved", "rejected", "removed"] }).notNull(),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    decidedAt: ts("decided_at"),
    decidedByUserId: text("decided_by_user_id"),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.creatorId] }), index("campaign_memberships_org_idx").on(t.orgId)],
);

/** Organization-level creator roster state (All / Removed tabs). */
export const orgCreators = pgTable(
  "org_creators",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    removedAt: ts("removed_at"),
    removedByUserId: text("removed_by_user_id"),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.creatorId] })],
);

export const reviewStatuses = ["submitted", "approved", "rejected"] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Null = not attributed to a campaign (reporting sentinel 0). */
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    /** Null = Custom Post with no playbook match (reporting sentinel 0). */
    playbookId: text("playbook_id").references(() => playbooks.id, { onDelete: "set null" }),
    /** Frozen playbook revision the submission was made against. */
    playbookRevision: integer("playbook_revision"),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creators.id),
    socialAccountId: text("social_account_id").references(() => socialAccounts.id),
    platform: text("platform", { enum: platforms }).notNull(),
    handle: text("handle").notNull(),
    /** Provider's content ID once resolved. */
    externalId: text("external_id"),
    url: text("url").notNull(),
    caption: text("caption").notNull().default(""),
    thumbnailUrl: text("thumbnail_url"),
    postedAt: ts("posted_at"),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
    reviewStatus: text("review_status", { enum: reviewStatuses }).notNull().default("submitted"),
    reviewReason: text("review_reason"),
    reviewedAt: ts("reviewed_at"),
    reviewedByUserId: text("reviewed_by_user_id"),
    /** Lifetime counters from the latest accepted observation; null = never observed (unavailable, not zero). */
    views: count("views"),
    likes: count("likes"),
    comments: count("comments"),
    bookmarks: count("bookmarks"),
    shares: count("shares"),
    metricsObservedAt: ts("metrics_observed_at"),
    metricsSource: text("metrics_source"),
  },
  (t) => [
    uniqueIndex("posts_platform_url_unique").on(t.platform, t.url),
    index("posts_org_idx").on(t.orgId),
    index("posts_campaign_idx").on(t.campaignId),
    index("posts_creator_idx").on(t.creatorId),
  ],
);

/** Raw cumulative counter observations; deltas are derived with correction handling. */
export const metricObservations = pgTable(
  "metric_observations",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    observedAt: ts("observed_at").notNull(),
    source: text("source").notNull(),
    /** Idempotency: the same provider observation is stored once. */
    sourceKey: text("source_key").notNull(),
    views: count("views").notNull(),
    likes: count("likes"),
    comments: count("comments"),
    bookmarks: count("bookmarks"),
    shares: count("shares"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    uniqueIndex("metric_observations_source_unique").on(t.source, t.sourceKey),
    index("metric_observations_post_time_idx").on(t.postId, t.observedAt),
    index("metric_observations_org_time_idx").on(t.orgId, t.observedAt),
  ],
);

/** Daily UTC rollup per post: incremental views earned that day and brand spend attributed that day. */
export const postDailyMetrics = pgTable(
  "post_daily_metrics",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    campaignId: text("campaign_id"),
    playbookId: text("playbook_id"),
    day: date("day", { mode: "string" }).notNull(),
    views: count("views").notNull().default(0),
    spendCents: integer("spend_cents").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.day] }), index("post_daily_metrics_org_day_idx").on(t.orgId, t.day)],
);

/** Daily installs per source (store actuals vs licensed estimates). Never summed across sources. */
export const installObservations = pgTable(
  "install_observations",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    source: text("source", { enum: ["app_store", "play_store", "estimate"] }).notNull(),
    installs: integer("installs").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    provenance: text("provenance").notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.day, t.source] })],
);
