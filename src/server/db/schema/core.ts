import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ----------------------------------------------------------------------------
 * Identity
 * ------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    /** Stored lowercased; uniqueness is case-insensitive by construction. */
    email: text("email").notNull(),
    emailVerifiedAt: ts("email_verified_at"),
    passwordHash: text("password_hash").notNull(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    disabledAt: ts("disabled_at"),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tokenDigest: text("token_digest").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    /** Last time the user re-entered their password; sensitive actions require this to be recent. */
    recentAuthAt: ts("recent_auth_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    userAgent: text("user_agent"),
  },
  (t) => [uniqueIndex("sessions_token_digest_unique").on(t.tokenDigest), index("sessions_user_idx").on(t.userId)],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["verify_email", "reset_password"] }).notNull(),
    tokenDigest: text("token_digest").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
  },
  (t) => [uniqueIndex("email_tokens_digest_unique").on(t.tokenDigest)],
);

/** Fixed-window counters for login, signup, invitation and API throttling. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/* ----------------------------------------------------------------------------
 * Organizations (brand workspaces)
 * ------------------------------------------------------------------------- */

export const planIds = ["basic", "unlimited"] as const;
export type PlanId = (typeof planIds)[number];

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Brand hashtag shown to creators (Branding). Distinct from each campaign's primary hashtag. */
    brandHashtag: text("brand_hashtag"),
    categories: jsonb("categories").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    websiteUrl: text("website_url"),
    appStoreUrl: text("app_store_url"),
    playStoreUrl: text("play_store_url"),
    /** Sanitized HTML (allowlisted tags only), max 1,000 characters of text. */
    descriptionHtml: text("description_html").notNull().default(""),
    /** Short plain-text description captured during onboarding. */
    shortDescription: text("short_description").notNull().default(""),
    brandColor: text("brand_color"),
    logoAssetId: text("logo_asset_id"),
    coverAssetId: text("cover_asset_id"),
    primaryOwnerUserId: text("primary_owner_user_id")
      .notNull()
      .references(() => users.id),
    planId: text("plan_id", { enum: planIds }).notNull().default("basic"),
    /** Charge threshold in cents ($10/$25/$50 observed options; see commercial policy). */
    billingThresholdCents: integer("billing_threshold_cents").notNull().default(5000),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    /** Optimistic-concurrency version for settings edits (branding, threshold). */
    version: integer("version").notNull().default(1),
  },
  (t) => [uniqueIndex("organizations_slug_unique").on(t.slug)],
);

export const roles = ["owner", "member"] as const;
export type Role = (typeof roles)[number];

export const memberships = pgTable(
  "memberships",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: roles }).notNull(),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invitationStatuses = ["pending", "accepted", "expired", "revoked"] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: roles }).notNull(),
    tokenDigest: text("token_digest").notNull(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    /** Stored status; `expired` is also derived at read time from expiresAt. */
    status: text("status", { enum: invitationStatuses }).notNull().default("pending"),
    acceptedAt: ts("accepted_at"),
    acceptedUserId: text("accepted_user_id").references(() => users.id),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("invitations_token_digest_unique").on(t.tokenDigest),
    index("invitations_org_idx").on(t.orgId),
  ],
);

/* ----------------------------------------------------------------------------
 * Audit and outbound email
 * ------------------------------------------------------------------------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id"),
    actorUserId: text("actor_user_id"),
    /** e.g. `campaign.activate`, `member.invite`, `integration.disconnect`. */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("audit_org_idx").on(t.orgId, t.at)],
);

export const emailOutbox = pgTable("email_outbox", {
  id: text("id").primaryKey(),
  toEmail: text("to_email").notNull(),
  template: text("template").notNull(),
  subject: text("subject").notNull(),
  /** Rendered plain-text body. Contains one-time links: never log it. */
  body: text("body").notNull(),
  status: text("status", { enum: ["queued", "sent", "failed", "provider_unconfigured"] }).notNull(),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  sentAt: ts("sent_at"),
});

/* ----------------------------------------------------------------------------
 * Acquisition and onboarding
 * ------------------------------------------------------------------------- */

export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  companyName: text("company_name").notNull().default(""),
  companyWebsite: text("company_website").notNull().default(""),
  /** Exact categorical band label as displayed, e.g. "$0 – $50K". */
  budgetBand: text("budget_band"),
  jobLevel: text("job_level"),
  jobFunction: text("job_function"),
  notes: text("notes").notNull().default(""),
  /** CTA attribution from `/start?cta=...`. */
  ctaSource: text("cta_source"),
  routeChoice: text("route_choice", { enum: ["self_serve", "learn"] }),
  stepReached: integer("step_reached").notNull().default(1),
  userId: text("user_id").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Server-persisted platform onboarding draft; one per user until completed. */
export const onboardingDrafts = pgTable("onboarding_drafts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Key of the screen the user last reached (see src/domain/onboarding.ts). */
  stepKey: text("step_key").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  /** Organization created from this draft (set when brand basics are first saved). */
  orgId: text("org_id").references(() => organizations.id),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  completedAt: ts("completed_at"),
  deferredPaymentAt: ts("deferred_payment_at"),
});

export const userFlags = pgTable("user_flags", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Last workspace the user opened, used by `/home` to redirect. */
  lastOrgId: text("last_org_id"),
  messagesDockState: text("messages_dock_state", { enum: ["minimized", "floating", "docked"] })
    .notNull()
    .default("minimized"),
  sidebarCollapsed: boolean("sidebar_collapsed").notNull().default(false),
});
