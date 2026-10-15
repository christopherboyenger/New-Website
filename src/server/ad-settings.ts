"use server";

/**
 * Ad settings (L11, L26–L28): the defaults every NEW ad launch starts from —
 * copy templates, naming convention, destination URL parameters and default
 * CTAs. Saving never rewrites existing launches.
 *
 * Every export re-authorizes from the URL slug. Saves are owner-only
 * (`ad_settings:edit`) and use optimistic concurrency on `ad_settings.version`
 * (version 0 = the workspace has no row yet).
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defaultNamingConvention, namingConventionSchema, type NamingConvention } from "@/domain/ad-naming";
import { copyTemplatesSchema, linkSettingsSchema, type LinkSettings } from "@/domain/tracking-params";
import { isValidCta } from "@/components/ads/cta-catalog";
import { ConflictError, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { hasPermission, requireOrgAction } from "./authz";
import { getDb, type DbLike } from "./db/client";
import { adSettings } from "./db/schema";

export interface AdDefaults {
  copyTemplates: string[];
  naming: NamingConvention;
  links: LinkSettings;
  defaultCta: { meta: string | null; tiktok: string | null };
}

export interface AdSettingsView {
  org: { slug: string; name: string };
  settings: AdDefaults;
  version: number;
  updatedAt: string | null;
  canEdit: boolean;
}

const ctaSchema = z.object({
  meta: z
    .string()
    .nullable()
    .refine((v) => v === null || isValidCta("meta", v), { message: "Choose a Meta button from the list." }),
  tiktok: z
    .string()
    .nullable()
    .refine((v) => v === null || isValidCta("tiktok", v), { message: "Choose a TikTok button from the list." }),
});

const adDefaultsSchema = z.object({
  copyTemplates: copyTemplatesSchema,
  naming: namingConventionSchema,
  links: linkSettingsSchema,
  defaultCta: ctaSchema,
});

/** Stored defaults for an org, or the product defaults (version 0) when none were saved. Internal: callers pass an authorized orgId. */
async function readAdDefaults(db: DbLike, orgId: string): Promise<{ settings: AdDefaults; version: number; updatedAt: Date | null }> {
  const [row] = await db
    .select({
      copyTemplates: adSettings.copyTemplates,
      naming: adSettings.naming,
      links: adSettings.links,
      defaultCta: adSettings.defaultCta,
      version: adSettings.version,
      updatedAt: adSettings.updatedAt,
    })
    .from(adSettings)
    .where(eq(adSettings.orgId, orgId))
    .limit(1);
  if (!row) {
    return {
      settings: { copyTemplates: [], naming: defaultNamingConvention, links: { websiteUrl: "", params: [] }, defaultCta: { meta: null, tiktok: null } },
      version: 0,
      updatedAt: null,
    };
  }
  const { version, updatedAt, ...settings } = row;
  return { settings, version, updatedAt };
}

export async function loadAdSettings(slug: string): Promise<ActionResult<AdSettingsView>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "workspace:read");
    const db = await getDb();
    const { settings, version, updatedAt } = await readAdDefaults(db, ctx.org.id);
    return ok({
      org: { slug: ctx.org.slug, name: ctx.org.name },
      settings,
      version,
      updatedAt: updatedAt?.toISOString() ?? null,
      canEdit: hasPermission(ctx, "ad_settings:edit"),
    });
  });
}

/** Read-only defaults for the launch-draft flow (same tenant rules). */
export async function loadAdDefaultsForLaunch(slug: string): Promise<ActionResult<{ settings: AdDefaults; version: number }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "workspace:read");
    const { settings, version } = await readAdDefaults(await getDb(), ctx.org.id);
    return ok({ settings, version });
  });
}

export async function saveAdSettings(slug: string, expectedVersion: number, input: AdDefaults): Promise<ActionResult<{ version: number; updatedAt: string }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "ad_settings:edit");
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new ConflictError("Reload Ad settings and try again.");
    const parsed = adDefaultsSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error, "Some settings need attention before they can be saved.");
    const data = parsed.data;
    const db = await getDb();
    const now = new Date();
    const conflict = "Ad settings were changed in another tab or by a teammate. Reload to see the latest version before saving again.";

    const saved =
      expectedVersion === 0
        ? await db
            .insert(adSettings)
            .values({ orgId: ctx.org.id, ...data, version: 1, updatedAt: now, updatedByUserId: ctx.user.id })
            .onConflictDoNothing({ target: adSettings.orgId })
            .returning({ version: adSettings.version, updatedAt: adSettings.updatedAt })
        : await db
            .update(adSettings)
            .set({ ...data, version: expectedVersion + 1, updatedAt: now, updatedByUserId: ctx.user.id })
            .where(and(eq(adSettings.orgId, ctx.org.id), eq(adSettings.version, expectedVersion)))
            .returning({ version: adSettings.version, updatedAt: adSettings.updatedAt });
    const row = saved[0];
    if (!row) throw new ConflictError(conflict);

    await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "ad_settings.update", targetType: "ad_settings", targetId: ctx.org.id, data: { version: row.version } });
    revalidatePath(`/home/${ctx.org.slug}/ad-settings`);
    return ok({ version: row.version, updatedAt: row.updatedAt.toISOString() }, "Ad settings saved. They apply to new launches only.");
  });
}
