/**
 * Tables owned by the "ads" feature area.
 *
 * `ad_rights_grants` records a creator's authorization for paid use of one
 * post (production-requirements.md "Ads and rights": organic-post ownership or
 * upload permission does not alone grant paid-ad rights). A post is eligible
 * for a launch draft only with an unrevoked, unexpired grant covering the
 * chosen provider. Direct submissions carry their rights window on
 * `ad_submissions` itself.
 */
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./core";
import { creators, posts } from "./creators";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const adRightsEvidenceKinds = ["creator_portal_consent", "signed_agreement", "provider_authorization"] as const;
export type AdRightsEvidenceKind = (typeof adRightsEvidenceKinds)[number];

export const adRightsGrants = pgTable(
  "ad_rights_grants",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    /** Ad providers the grant covers. */
    providers: jsonb("providers").$type<Array<"meta_ads" | "tiktok_ads">>().notNull(),
    evidenceKind: text("evidence_kind", { enum: adRightsEvidenceKinds }).notNull(),
    /** Non-secret pointer to the evidence (agreement ID, consent record ID, provider authorization code reference). */
    evidenceReference: text("evidence_reference").notNull(),
    grantedAt: ts("granted_at").notNull(),
    /** Null = no expiry stated by the grant. */
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    recordedByUserId: text("recorded_by_user_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("ad_rights_grants_org_post_idx").on(t.orgId, t.postId)],
);
