/**
 * DEVELOPMENT ONLY — inserts clearly labelled FIXTURE records ("Fixture …")
 * into one workspace of the local embedded database so populated layouts can
 * be checked. Never run against a real database (refuses if DATABASE_URL is set).
 *
 *   npx tsx --conditions=react-server scripts/dev-fixtures.mts --org <slug>
 *
 * Deterministic: the same workspace always receives the same values.
 */
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";

if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
  console.error("Refusing to run: fixtures are only for the local development database.");
  process.exit(1);
}
const { values } = parseArgs({ options: { org: { type: "string" } } });
if (!values.org) {
  console.error("--org <slug> is required");
  process.exit(1);
}

const { getDb } = await import("../src/server/db/client.ts");
const s = await import("../src/server/db/schema/index.ts");
const { newId } = await import("../src/lib/ids.ts");
const { defaultApprovals, defaultTargeting } = await import("../src/domain/campaign.ts");
const { playbookTemplates } = await import("../src/domain/playbook-templates.ts");

const db = await getDb();
const [org] = await db.select().from(s.organizations).where(eq(s.organizations.slug, values.org)).limit(1);
if (!org) throw new Error(`No workspace with slug ${values.org}`);

// Deterministic PRNG (mulberry32) seeded from the slug.
let seed = [...org.slug].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const suffix = org.slug.replace(/[^a-z0-9]/g, "").slice(0, 12);

const campaignRows = [
  { name: "Fixture campaign A", status: "active" as const, format: "ugc" as const, tag: `fixturea${suffix}` },
  { name: "Fixture campaign B", status: "paused" as const, format: "slideshow" as const, tag: `fixtureb${suffix}` },
];
const campaigns = [];
for (const c of campaignRows) {
  const [row] = await db
    .insert(s.campaigns)
    .values({
      id: newId("cmp"),
      orgId: org.id,
      name: c.name,
      primaryHashtag: c.tag,
      format: c.format,
      status: c.status,
      dailyBudgetCents: 500_00,
      targeting: { ...defaultTargeting, platforms: ["tiktok", "instagram"] },
      approvals: defaultApprovals,
      activatedAt: c.status === "active" ? new Date() : null,
      pausedAt: c.status === "paused" ? new Date() : null,
    })
    .returning();
  campaigns.push(row);
}

const ugcTemplate = playbookTemplates.find((t) => t.id === "ugc-greenscreen")!;
const slideTemplate = playbookTemplates.find((t) => t.format === "slideshow")!;
const playbooks = [];
for (const [i, spec] of [
  { campaign: campaigns[0], name: "Fixture playbook — greenscreen", status: "published" as const, t: ugcTemplate },
  { campaign: campaigns[0], name: "Fixture playbook — draft", status: "draft" as const, t: ugcTemplate },
  { campaign: campaigns[1], name: "Fixture playbook — listicle", status: "published" as const, t: slideTemplate },
].entries()) {
  const [row] = await db
    .insert(s.playbooks)
    .values({
      id: newId("pbk"),
      orgId: org.id,
      campaignId: spec.campaign.id,
      name: spec.name,
      format: spec.campaign.format,
      status: spec.status,
      active: spec.status === "published",
      templateId: spec.t.id,
      content: spec.t.content,
      descriptions: spec.t.descriptions,
      hashtags: [],
      publishedRevision: spec.status === "published" ? 1 : null,
      publishedAt: spec.status === "published" ? new Date() : null,
    })
    .returning();
  if (spec.status === "published") {
    await db.insert(s.playbookRevisions).values({ id: newId("rev"), playbookId: row.id, orgId: org.id, revision: 1, name: row.name, content: row.content, descriptions: row.descriptions, hashtags: row.hashtags });
  }
  playbooks.push(row);
  void i;
}

const platforms = ["tiktok", "instagram", "youtube"] as const;
const levels = ["bronze", "silver", "gold", "platinum"] as const;
const creatorIds: string[] = [];
for (let i = 1; i <= 6; i++) {
  const [c] = await db.insert(s.creators).values({ id: newId("crt"), displayName: `Fixture Creator ${i}`, level: pick(levels), country: "US" }).returning();
  creatorIds.push(c.id);
  await db.insert(s.orgCreators).values({ orgId: org.id, creatorId: c.id, removedAt: i === 6 ? new Date() : null });
  await db.insert(s.socialAccounts).values({ id: newId("acc"), creatorId: c.id, platform: pick(platforms), handle: `fixture_${suffix}_${i}`, verification: "verified", verifiedAt: new Date() });
}

let postCount = 0;
for (let i = 0; i < 24; i++) {
  const campaign = i % 4 === 3 ? campaigns[1] : campaigns[0];
  const playbook = i % 5 === 4 ? null : campaign.id === campaigns[0].id ? playbooks[0] : playbooks[2];
  const creatorId = creatorIds[i % creatorIds.length];
  const review = i % 7 === 6 ? "rejected" : i % 9 === 8 ? "submitted" : "approved";
  const postedDaysAgo = Math.floor(rand() * 40);
  const views = Math.floor(2_000 + rand() * 120_000);
  const [post] = await db
    .insert(s.posts)
    .values({
      id: newId("pst"),
      orgId: org.id,
      campaignId: campaign.id,
      playbookId: playbook?.id ?? null,
      playbookRevision: playbook ? 1 : null,
      creatorId,
      platform: pick(platforms),
      handle: `fixture_${suffix}_${(i % 6) + 1}`,
      url: `https://fixtures.invalid/${org.slug}/post-${i + 1}`,
      caption: `Fixture post ${i + 1}`,
      postedAt: new Date(Date.now() - postedDaysAgo * 86_400_000),
      reviewStatus: review,
      reviewReason: review === "rejected" ? "Fixture: missing primary hashtag" : null,
      views,
      likes: Math.floor(views * (0.02 + rand() * 0.06)),
      comments: Math.floor(views * 0.004),
      bookmarks: Math.floor(views * 0.003),
      shares: Math.floor(views * 0.002),
      metricsObservedAt: new Date(),
      metricsSource: "fixture",
    })
    .returning();
  postCount++;
  if (review !== "approved") continue;
  let remaining = views;
  for (let d = postedDaysAgo; d >= 0 && remaining > 0; d--) {
    const v = Math.min(remaining, Math.floor(views * (0.05 + rand() * 0.25)));
    remaining -= v;
    await db.insert(s.postDailyMetrics).values({ postId: post.id, orgId: org.id, campaignId: post.campaignId, playbookId: post.playbookId, day: day(d), views: v, spendCents: Math.round((v / 1000) * 150) });
  }
  // Hourly cumulative observations for the last 26 hours (rolling counters).
  let cumulative = Math.max(0, views - 3000);
  for (let h = 26; h >= 0; h--) {
    cumulative += Math.floor(rand() * 120);
    await db.insert(s.metricObservations).values({
      id: newId("obs"),
      postId: post.id,
      orgId: org.id,
      observedAt: new Date(Date.now() - h * 3_600_000),
      source: "fixture",
      sourceKey: `${post.id}:${h}`,
      views: cumulative,
    });
  }
}

console.log(`Inserted fixture data into /home/${org.slug}: 2 campaigns, 3 playbooks, 6 creators, ${postCount} posts.`);
process.exit(0);
