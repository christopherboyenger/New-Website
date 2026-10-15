/**
 * Test-only record factories. These create isolated fixtures inside a test
 * database (see createTestDb); they are never imported by application code
 * and never seed real workspaces.
 */
import { newId } from "@/lib/ids";
import { getDb } from "@/server/db/client";
import {
  campaigns,
  creators,
  memberships,
  metricObservations,
  organizations,
  playbooks,
  postDailyMetrics,
  posts,
  users,
  type Role,
} from "@/server/db/schema";
import { defaultApprovals, defaultTargeting, type Platform } from "@/domain/campaign";
import { emptyContent, type ContentFormat } from "@/domain/playbook-content";

let seq = 0;
const next = () => ++seq;

export async function makeUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const db = await getDb();
  const n = next();
  const [row] = await db
    .insert(users)
    .values({
      id: newId("usr"),
      email: `user${n}@example.test`,
      passwordHash: "scrypt$invalid",
      firstName: `First${n}`,
      lastName: `Last${n}`,
      emailVerifiedAt: new Date(),
      ...overrides,
    })
    .returning();
  return row;
}

/** Creates an org whose primary owner is `owner` (created if omitted). */
export async function makeOrg(opts: { owner?: { id: string }; slug?: string; name?: string; planId?: "basic" | "unlimited" } = {}) {
  const db = await getDb();
  const owner = opts.owner ?? (await makeUser());
  const n = next();
  const [org] = await db
    .insert(organizations)
    .values({
      id: newId("org"),
      slug: opts.slug ?? `org-${n}`,
      name: opts.name ?? `Org ${n}`,
      primaryOwnerUserId: owner.id,
      planId: opts.planId ?? "basic",
    })
    .returning();
  await db.insert(memberships).values({ orgId: org.id, userId: owner.id, role: "owner" });
  return { org, owner };
}

export async function addMember(orgId: string, role: Role = "member", user?: { id: string }) {
  const db = await getDb();
  const u = user ?? (await makeUser());
  await db.insert(memberships).values({ orgId, userId: u.id, role });
  return u;
}

export async function makeCampaign(orgId: string, overrides: Partial<typeof campaigns.$inferInsert> = {}) {
  const db = await getDb();
  const n = next();
  const [row] = await db
    .insert(campaigns)
    .values({
      id: newId("cmp"),
      orgId,
      name: `Campaign ${n}`,
      primaryHashtag: `tag${n}x${Math.random().toString(36).slice(2, 7)}`,
      format: "ugc",
      dailyBudgetCents: 500_00,
      targeting: defaultTargeting,
      approvals: defaultApprovals,
      ...overrides,
    })
    .returning();
  return row;
}

export async function makePlaybook(orgId: string, campaignId: string, overrides: Partial<typeof playbooks.$inferInsert> = {}) {
  const db = await getDb();
  const format: ContentFormat = (overrides.format as ContentFormat | undefined) ?? "ugc";
  const [row] = await db
    .insert(playbooks)
    .values({
      id: newId("pbk"),
      orgId,
      campaignId,
      name: `Playbook ${next()}`,
      format,
      content: emptyContent(format),
      ...overrides,
    })
    .returning();
  return row;
}

export async function makeCreator(overrides: Partial<typeof creators.$inferInsert> = {}) {
  const db = await getDb();
  const [row] = await db
    .insert(creators)
    .values({ id: newId("crt"), displayName: `Creator ${next()}`, ...overrides })
    .returning();
  return row;
}

export async function makePost(
  orgId: string,
  creatorId: string,
  overrides: Partial<typeof posts.$inferInsert> & { platform?: Platform } = {},
) {
  const db = await getDb();
  const n = next();
  const [row] = await db
    .insert(posts)
    .values({
      id: newId("pst"),
      orgId,
      creatorId,
      platform: "tiktok",
      handle: `handle${n}`,
      url: `https://example.test/p/${n}`,
      reviewStatus: "approved",
      ...overrides,
    })
    .returning();
  return row;
}

export async function addDailyMetric(post: { id: string; orgId: string; campaignId: string | null; playbookId: string | null }, day: string, views: number, spendCents = 0) {
  const db = await getDb();
  await db.insert(postDailyMetrics).values({ postId: post.id, orgId: post.orgId, campaignId: post.campaignId, playbookId: post.playbookId, day, views, spendCents });
}

export async function addObservation(post: { id: string; orgId: string }, observedAt: Date, views: number) {
  const db = await getDb();
  await db.insert(metricObservations).values({
    id: newId("obs"),
    postId: post.id,
    orgId: post.orgId,
    observedAt,
    source: "test",
    sourceKey: `${post.id}:${observedAt.toISOString()}`,
    views,
  });
}
