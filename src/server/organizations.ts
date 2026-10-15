import "server-only";
import { eq, like } from "drizzle-orm";
import { z } from "zod";
import { newId, slugify } from "@/lib/ids";
import { commercialPolicy } from "@/config/commercial-policy";
import { recordAudit } from "./audit";
import { getDb, type DbLike } from "./db/client";
import { adSettings, billingAccounts, memberships, organizations, userFlags } from "./db/schema";

export const RESERVED_SLUGS = new Set(["new", "settings", "admin", "api", "auth", "onboarding", "ops", "creator", "dev"]);

export const brandBasicsSchema = z.object({
  name: z.string().trim().min(1, "Enter your brand name.").max(80, "Use 80 characters or fewer."),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || isHttpUrlOrDomain(v), "Enter a website or App Store link, e.g. yourbrand.com.")
    .default(""),
  description: z.string().trim().max(500, "Keep the description under 500 characters.").default(""),
});

export function isHttpUrlOrDomain(value: string): boolean {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Normalizes "yourbrand.com" → "https://yourbrand.com". */
export function normalizeUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

async function uniqueSlug(db: DbLike, base: string): Promise<string> {
  const root = RESERVED_SLUGS.has(base) ? `${base}-brand` : base;
  const taken = new Set((await db.select({ slug: organizations.slug }).from(organizations).where(like(organizations.slug, `${root}%`))).map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 10_000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${newId("org").slice(4, 10)}`;
}

/**
 * Creates a brand workspace with the creator as primary owner, plus its
 * billing profile and ad-launch defaults. No campaigns, posts or metrics are
 * created — a new workspace is genuinely empty.
 */
export async function createOrganization(userId: string, input: z.input<typeof brandBasicsSchema>) {
  const data = brandBasicsSchema.parse(input);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const id = newId("org");
    const slug = await uniqueSlug(tx, slugify(data.name));
    const isAppStore = /apps\.apple\.com|play\.google\.com/i.test(data.website);
    const [org] = await tx
      .insert(organizations)
      .values({
        id,
        slug,
        name: data.name,
        websiteUrl: isAppStore ? null : normalizeUrl(data.website),
        appStoreUrl: /apps\.apple\.com/i.test(data.website) ? normalizeUrl(data.website) : null,
        playStoreUrl: /play\.google\.com/i.test(data.website) ? normalizeUrl(data.website) : null,
        shortDescription: data.description,
        primaryOwnerUserId: userId,
        billingThresholdCents: commercialPolicy.defaultBillingThresholdCents,
      })
      .returning();
    await tx.insert(memberships).values({ orgId: id, userId, role: "owner" });
    await tx.insert(billingAccounts).values({ orgId: id });
    await tx.insert(adSettings).values({
      orgId: id,
      copyTemplates: [],
      naming: { fields: [{ kind: "date" }, { kind: "creator" }], separator: "_" },
      links: { websiteUrl: org.websiteUrl ?? "", params: [] },
      defaultCta: { meta: null, tiktok: null },
    });
    await tx
      .insert(userFlags)
      .values({ userId, lastOrgId: id })
      .onConflictDoUpdate({ target: userFlags.userId, set: { lastOrgId: id } });
    await recordAudit({ orgId: id, actorUserId: userId, action: "organization.create" }, tx);
    return org;
  });
}

export async function rememberLastOrg(userId: string, orgId: string): Promise<void> {
  const db = await getDb();
  await db.insert(userFlags).values({ userId, lastOrgId: orgId }).onConflictDoUpdate({ target: userFlags.userId, set: { lastOrgId: orgId } });
}

export async function getOrganizationById(orgId: string) {
  const db = await getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return org ?? null;
}
