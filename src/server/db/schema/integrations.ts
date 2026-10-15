import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./core";
import { posts } from "./creators";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const integrationProviders = ["app_store_connect", "google_play", "meta_ads", "tiktok_ads"] as const;
export type IntegrationProvider = (typeof integrationProviders)[number];

/**
 * Readiness lifecycle (production-integration-contracts.md §3). "connected" is only
 * set after a successful verification call, never because a form was submitted.
 */
export const integrationStatuses = [
  "not_configured",
  "awaiting_customer_grant",
  "pending_app_review",
  "verifying",
  "connected",
  "limited_permissions",
  "reauthorization_required",
  "revocation_pending",
  "disconnected",
  "error",
] as const;
export type IntegrationStatus = (typeof integrationStatuses)[number];

export const integrationInstallations = pgTable(
  "integration_installations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: integrationProviders }).notNull(),
    status: text("status", { enum: integrationStatuses }).notNull(),
    connectedByUserId: text("connected_by_user_id").references(() => users.id),
    /** Non-secret identifiers (issuer ID, key ID, package name, advertiser IDs...). */
    publicConfig: jsonb("public_config").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    selectedAssets: jsonb("selected_assets").$type<Array<{ id: string; name: string; kind: string }>>().notNull().default(sql`'[]'::jsonb`),
    grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    generation: integer("generation").notNull().default(1),
    connectedAt: ts("connected_at"),
    verifiedAt: ts("verified_at"),
    lastSyncAt: ts("last_sync_at"),
    sourceWatermark: text("source_watermark"),
    lastErrorCategory: text("last_error_category"),
    lastErrorAt: ts("last_error_at"),
    revokedAt: ts("revoked_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("integration_installations_org_provider_unique").on(t.orgId, t.provider)],
);

/** Envelope-encrypted secrets bound (via AEAD associated data) to org/installation/provider/generation. */
export const credentialVersions = pgTable(
  "credential_versions",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id")
      .notNull()
      .references(() => integrationInstallations.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    generation: integer("generation").notNull(),
    sealed: jsonb("sealed").$type<{ v: 1; iv: string; tag: string; ct: string }>().notNull(),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    destroyedAt: ts("destroyed_at"),
  },
  (t) => [uniqueIndex("credential_versions_install_gen_unique").on(t.installationId, t.generation)],
);

export const oauthAttempts = pgTable(
  "oauth_attempts",
  {
    id: text("id").primaryKey(),
    stateDigest: text("state_digest").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: integrationProviders }).notNull(),
    /** Sealed PKCE verifier where the provider supports PKCE. */
    pkceVerifierSealed: jsonb("pkce_verifier_sealed").$type<{ v: 1; iv: string; tag: string; ct: string }>(),
    returnPath: text("return_path").notNull(),
    requestedScopes: jsonb("requested_scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
  },
  (t) => [uniqueIndex("oauth_attempts_state_unique").on(t.stateDigest)],
);

export const apiGrantScopes = ["reports:read", "campaigns:read", "playbooks:read", "creators:read"] as const;
export type ApiGrantScope = (typeof apiGrantScopes)[number];

/** Product-issued reporting API tokens: shown once, stored as keyed digest + public prefix. */
export const apiGrants = pgTable(
  "api_grants",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenDigest: text("token_digest").notNull(),
    scopes: jsonb("scopes").$type<ApiGrantScope[]>().notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    lastUsedAt: ts("last_used_at"),
  },
  (t) => [uniqueIndex("api_grants_digest_unique").on(t.tokenDigest), index("api_grants_org_idx").on(t.orgId)],
);

export interface NamingConvention {
  /** Ordered tokens. The trailing platform ID is always appended by the generator, never configurable. */
  fields: Array<{ kind: "custom"; value: string } | { kind: "date" } | { kind: "creator" }>;
  separator: string;
}

export interface LinkSettings {
  websiteUrl: string;
  params: Array<{ key: string; value: string }>;
}

/** Defaults for NEW ad launches only; changing them never rewrites existing ads. */
export const adSettings = pgTable("ad_settings", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  copyTemplates: jsonb("copy_templates").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  naming: jsonb("naming").$type<NamingConvention>().notNull(),
  links: jsonb("links").$type<LinkSettings>().notNull(),
  defaultCta: jsonb("default_cta").$type<{ meta: string | null; tiktok: string | null }>().notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedByUserId: text("updated_by_user_id"),
});

export const adLaunchStages = [
  "draft",
  "validating",
  "creating_paused",
  "awaiting_confirmation",
  "activating",
  "active",
  "rejected",
  "paused",
  "failed",
  "reconciliation_required",
] as const;

/** Paid-ad launch saga (production-integration-contracts.md §6). */
export const adLaunches = pgTable(
  "ad_launches",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    installationId: text("installation_id").references(() => integrationInstallations.id),
    provider: text("provider", { enum: ["meta_ads", "tiktok_ads"] }).notNull(),
    postId: text("post_id").references(() => posts.id),
    submissionId: text("submission_id"),
    adName: text("ad_name").notNull(),
    bodyCopy: text("body_copy").notNull().default(""),
    destinationUrl: text("destination_url"),
    cta: text("cta"),
    stage: text("stage", { enum: adLaunchStages }).notNull().default("draft"),
    externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    rightsEvidence: jsonb("rights_evidence").$type<Record<string, unknown>>(),
    lastError: text("last_error"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ad_launches_org_idx").on(t.orgId)],
);

/** Direct creator video/image submissions intended for paid use. */
export const adSubmissions = pgTable(
  "ad_submissions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    creatorId: text("creator_id").notNull(),
    mediaAssetId: text("media_asset_id"),
    note: text("note").notNull().default(""),
    status: text("status", { enum: ["submitted", "accepted", "declined"] }).notNull().default("submitted"),
    rightsGrantedAt: ts("rights_granted_at"),
    rightsExpiresAt: ts("rights_expires_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("ad_submissions_org_idx").on(t.orgId)],
);
