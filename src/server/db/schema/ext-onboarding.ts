/**
 * Tables owned by the "onboarding" feature area.
 */
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./core";

/**
 * Exactly-once guard for creating a workspace from an onboarding draft. The
 * first request to insert the draft's row creates the organization; any
 * concurrent or repeated request sees the claim and never creates a second
 * one. `draftId` identifies one draft instance (a fresh draft started with
 * `/onboarding?new=1` gets a new ID and may create its own workspace).
 */
export const onboardingOrgClaims = pgTable("onboarding_org_claims", {
  draftId: text("draft_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Set once the organization exists; null while creation is in flight. */
  orgId: text("org_id").references(() => organizations.id, { onDelete: "set null" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
