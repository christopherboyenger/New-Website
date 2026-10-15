import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { CampaignApprovals, CampaignTargeting } from "@/domain/campaign";
import { campaignStatuses, pricingModes } from "@/domain/campaign";
import type { PlaybookContent } from "@/domain/playbook-content";
import { contentFormats } from "@/domain/playbook-content";
import { organizations, users } from "./core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Normalized (no '#', lowercase). Unique across the platform so posts match exactly one campaign. */
    primaryHashtag: text("primary_hashtag").notNull(),
    format: text("format", { enum: contentFormats }).notNull(),
    /** Campaigns begin inactive; only an explicit owner action activates them. */
    status: text("status", { enum: campaignStatuses }).notNull().default("inactive"),
    pricingMode: text("pricing_mode", { enum: pricingModes }).notNull().default("daily"),
    /** Daily average target (not a cap) for Daily mode. */
    dailyBudgetCents: integer("daily_budget_cents").notNull(),
    cpmCapCents: integer("cpm_cap_cents"),
    targeting: jsonb("targeting").$type<CampaignTargeting>().notNull(),
    approvals: jsonb("approvals").$type<CampaignApprovals>().notNull(),
    /** Null = unlimited creators. */
    maxCreators: integer("max_creators"),
    version: integer("version").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    activatedAt: ts("activated_at"),
    pausedAt: ts("paused_at"),
  },
  (t) => [
    uniqueIndex("campaigns_primary_hashtag_unique").on(t.primaryHashtag),
    index("campaigns_org_idx").on(t.orgId),
  ],
);

export const playbookStatuses = ["draft", "published"] as const;
export type PlaybookStatus = (typeof playbookStatuses)[number];

export const playbooks = pgTable(
  "playbooks",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    format: text("format", { enum: contentFormats }).notNull(),
    /** Draft until a revision is published. Publishing never activates the campaign or charges. */
    status: text("status", { enum: playbookStatuses }).notNull().default("draft"),
    /** Distribution switch for a published playbook (shown to eligible creators while campaign is active). */
    active: boolean("active").notNull().default(false),
    templateId: text("template_id"),
    /** Working draft content; published revisions are frozen in playbook_revisions. */
    content: jsonb("content").$type<PlaybookContent>().notNull(),
    descriptions: jsonb("descriptions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Optimistic concurrency for draft saves. */
    version: integer("version").notNull().default(1),
    publishedRevision: integer("published_revision"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    publishedAt: ts("published_at"),
  },
  (t) => [index("playbooks_org_idx").on(t.orgId), index("playbooks_campaign_idx").on(t.campaignId)],
);

/** Frozen, published distribution versions. Submissions reference the revision they were made against. */
export const playbookRevisions = pgTable(
  "playbook_revisions",
  {
    id: text("id").primaryKey(),
    playbookId: text("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    revision: integer("revision").notNull(),
    name: text("name").notNull(),
    content: jsonb("content").$type<PlaybookContent>().notNull(),
    descriptions: jsonb("descriptions").$type<string[]>().notNull(),
    hashtags: jsonb("hashtags").$type<string[]>().notNull(),
    publishedAt: ts("published_at").notNull().defaultNow(),
    publishedByUserId: text("published_by_user_id").references(() => users.id),
  },
  (t) => [uniqueIndex("playbook_revisions_unique").on(t.playbookId, t.revision)],
);

export const mediaAssetStatuses = ["pending_upload", "ready", "failed"] as const;

/** Tenant-owned media. Binary storage requires a provisioned object store; until then only metadata/external URLs exist. */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    purpose: text("purpose", { enum: ["logo", "cover", "reference", "slide", "submission"] }).notNull(),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    status: text("status", { enum: mediaAssetStatuses }).notNull().default("pending_upload"),
    title: text("title").notNull().default(""),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("media_assets_org_idx").on(t.orgId)],
);
