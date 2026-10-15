import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { RICH_TEXT_MAX_CHARS, validateRichText } from "@/domain/rich-text";
import { ConflictError, fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { hasPermission, requireOrgAction, type OrgContext } from "./authz";
import { getDb } from "./db/client";
import { organizations } from "./db/schema";
import { capability } from "./readiness";

/**
 * Branding settings (L12). Owners edit (`branding:edit`); everyone else sees
 * the same form read-only. Saves use optimistic concurrency on
 * organizations.version: a stale version is a conflict, never an overwrite.
 * The description is sanitized on the server (src/domain/rich-text.ts).
 * Logo/cover uploads need object storage, which is not provisioned, so the
 * page shows a not-configured notice instead of an upload control.
 */

/** Brand category taxonomy shown to creators (application-defined; see PEOPLE decisions). */
export const brandCategories = [
  "Apparel & Fashion",
  "Apps & Software",
  "Automotive",
  "Beauty & Personal Care",
  "Books & Publishing",
  "Education",
  "Entertainment",
  "Finance",
  "Fitness",
  "Food & Beverage",
  "Gaming",
  "Health & Wellness",
  "Home & Garden",
  "Music",
  "Parenting & Family",
  "Pets",
  "Sports",
  "Technology & Electronics",
  "Travel & Hospitality",
  "Other",
] as const;
export type BrandCategory = (typeof brandCategories)[number];

export const BRAND_NAME_MAX = 80;
export const HASHTAG_PATTERN = /^[a-z0-9_]{2,50}$/;

export interface BrandingView {
  name: string;
  brandHashtag: string;
  categories: [string, string, string];
  brandColor: string;
  descriptionHtml: string;
  websiteUrl: string;
  appStoreUrl: string;
  playStoreUrl: string;
  version: number;
  hasLogo: boolean;
  hasCover: boolean;
}

export interface BrandingPageData {
  branding: BrandingView;
  canEdit: boolean;
  mediaStorage: { configured: boolean; detail: string };
}

/** Default swatch for the color picker when no brand color is set (a neutral, not the product accent). */
export const DEFAULT_BRAND_COLOR = "#1c1917";

export function brandingView(org: OrgContext["org"]): BrandingView {
  const known = (org.categories ?? []).filter((c): c is string => (brandCategories as readonly string[]).includes(c));
  return {
    name: org.name,
    brandHashtag: org.brandHashtag ?? "",
    categories: [known[0] ?? "", known[1] ?? "", known[2] ?? ""],
    brandColor: org.brandColor ?? "",
    descriptionHtml: org.descriptionHtml,
    websiteUrl: org.websiteUrl ?? "",
    appStoreUrl: org.appStoreUrl ?? "",
    playStoreUrl: org.playStoreUrl ?? "",
    version: org.version,
    hasLogo: Boolean(org.logoAssetId),
    hasCover: Boolean(org.coverAssetId),
  };
}

export function loadBrandingPage(ctx: OrgContext): BrandingPageData {
  const storage = capability("media_storage");
  return {
    branding: brandingView(ctx.org),
    canEdit: hasPermission(ctx, "branding:edit"),
    mediaStorage: { configured: storage.configured, detail: storage.detail },
  };
}

/* ----------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

function parseHttpUrl(value: string): URL | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** Optional URL field: "" → null; bare domains get https://; host rules per store. */
function linkField(message: string, hostRule?: (host: string) => boolean) {
  return z
    .string()
    .trim()
    .max(500, "Use 500 characters or fewer.")
    .transform((value, ctx) => {
      if (!value) return null;
      const url = parseHttpUrl(value);
      if (!url || (hostRule && !hostRule(url.hostname.toLowerCase()))) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return url.toString();
    });
}

const categorySchema = z.union([z.literal(""), z.enum(brandCategories, "Choose a category from the list.")]);

export const brandingSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1, "Enter your brand's name.").max(BRAND_NAME_MAX, `Use ${BRAND_NAME_MAX} characters or fewer.`),
    brandHashtag: z
      .string()
      .trim()
      .transform((v) => v.replace(/^#/, "").toLowerCase())
      .refine((v) => v === "" || HASHTAG_PATTERN.test(v), "Use 2–50 letters, numbers or underscores, without spaces."),
    categories: z.tuple([categorySchema, categorySchema, categorySchema]),
    brandColor: z
      .string()
      .trim()
      .transform((v) => v.toLowerCase())
      .refine((v) => v === "" || /^#[0-9a-f]{6}$/.test(v), "Enter a hex color like #1a2b3c."),
    descriptionHtml: z.string().max(20_000, `Keep the description under ${RICH_TEXT_MAX_CHARS.toLocaleString("en-US")} characters.`),
    websiteUrl: linkField("Enter a valid website address, e.g. https://www.example.com."),
    appStoreUrl: linkField("Enter an App Store link (https://apps.apple.com/…).", (host) => host === "apps.apple.com"),
    playStoreUrl: linkField("Enter a Google Play link (https://play.google.com/store/apps/…).", (host) => host === "play.google.com"),
  })
  .superRefine((value, ctx) => {
    const picked = value.categories.filter(Boolean);
    if (new Set(picked).size !== picked.length) ctx.addIssue({ code: "custom", path: ["categories"], message: "Choose three different categories." });
  });

/* ----------------------------------------------------------------------------
 * Command
 * ------------------------------------------------------------------------- */

export async function updateBranding(slug: string, input: unknown): Promise<ActionResult<{ branding: BrandingView }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "branding:edit");
    const parsed = brandingSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const data = parsed.data;
    const description = validateRichText(data.descriptionHtml);
    if (!description.ok) return fail(description.error, "validation", { descriptionHtml: description.error });

    const next = {
      name: data.name,
      brandHashtag: data.brandHashtag || null,
      categories: data.categories.filter(Boolean),
      brandColor: data.brandColor || null,
      descriptionHtml: description.html,
      websiteUrl: data.websiteUrl,
      appStoreUrl: data.appStoreUrl,
      playStoreUrl: data.playStoreUrl,
    };
    const before = brandingView(ctx.org);
    const changed = (Object.keys(next) as Array<keyof typeof next>).filter((key) => {
      const prev = key === "categories" ? before.categories.filter(Boolean) : (ctx.org[key] ?? null);
      return JSON.stringify(prev) !== JSON.stringify(next[key]);
    });

    const db = await getDb();
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(organizations)
        .set({ ...next, updatedAt: new Date(), version: sql`${organizations.version} + 1` })
        .where(and(eq(organizations.id, ctx.org.id), eq(organizations.version, data.expectedVersion)))
        .returning();
      if (rows.length === 0) throw new ConflictError("Branding was changed by someone else since you opened this page. Reload to see the latest version before saving again.");
      await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "branding.update", targetType: "organization", targetId: ctx.org.id, data: { fields: changed } }, tx);
      return rows[0];
    });
    return ok({ branding: brandingView(updated) }, "Branding saved.");
  });
}
