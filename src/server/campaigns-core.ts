import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/ids";
import {
  defaultApprovals,
  defaultTargeting,
  genderOptions,
  isValidHashtag,
  MIN_DAILY_BUDGET_CENTS,
  minCreatorLevelOptions,
  normalizeHashtag,
  platforms,
  pricingModes,
} from "@/domain/campaign";
import { contentFormats } from "@/domain/playbook-content";
import { EntitlementError, missingEntitlements } from "@/domain/entitlements";
import { recordAudit } from "./audit";
import { ConflictError } from "./action-result";
import type { CommandContext } from "./authz";
import { getDb } from "./db/client";
import { campaigns } from "./db/schema";

export const MAX_DAILY_BUDGET_CENTS = 1_000_000_00;

export const targetingSchema = z.object({
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250).default(defaultTargeting.countries),
  platforms: z.array(z.enum(platforms)).max(platforms.length).default(defaultTargeting.platforms),
  ageMin: z.number().int().min(13).max(100).nullable().default(null),
  ageMax: z.number().int().min(13).max(100).nullable().default(null),
  gender: z.enum(genderOptions).default("any"),
  metros: z.array(z.string().min(1).max(80)).max(300).default([]),
  minCreatorLevel: z.enum(minCreatorLevelOptions).default("all"),
});

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a campaign name.").max(100, "Use 100 characters or fewer."),
    primaryHashtag: z
      .string()
      .transform(normalizeHashtag)
      .refine(isValidHashtag, "Use 2–50 letters, numbers or underscores."),
    format: z.enum(contentFormats),
    pricingMode: z.enum(pricingModes).default("daily"),
    dailyBudgetCents: z
      .number()
      .int()
      .min(MIN_DAILY_BUDGET_CENTS, "The minimum daily budget is $50.")
      .max(MAX_DAILY_BUDGET_CENTS, "That budget is above the allowed maximum."),
    cpmCapCents: z.number().int().min(1, "Enter a CPM cap above $0, or leave it empty.").max(100_000).nullable().default(null),
    targeting: targetingSchema.default(defaultTargeting),
    approvals: z
      .object({ requireCreatorApproval: z.boolean().default(false), requireDedicatedAccount: z.boolean().default(false) })
      .default(defaultApprovals),
    maxCreators: z.number().int().min(1).max(1_000_000).nullable().default(null),
  })
  .refine((v) => v.targeting.ageMin === null || v.targeting.ageMax === null || v.targeting.ageMin <= v.targeting.ageMax, {
    message: "Minimum age must be at or below maximum age.",
    path: ["targeting", "ageMin"],
  });

export type CampaignInput = z.output<typeof campaignInputSchema>;

export class HashtagTakenError extends Error {
  constructor() {
    super("That hashtag is already used by another campaign. Choose a different one.");
    this.name = "HashtagTakenError";
  }
}

export async function isHashtagAvailable(tag: string, exceptCampaignId?: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.primaryHashtag, normalizeHashtag(tag))).limit(1);
  return !row || row.id === exceptCampaignId;
}

/**
 * Creates a campaign in the `inactive` state. Requires `campaign:manage`
 * (checked by the caller via requireOrgAction) and enforces plan entitlements
 * server-side. Never activates or charges.
 */
export async function createCampaign(ctx: CommandContext, raw: z.input<typeof campaignInputSchema>) {
  const input = campaignInputSchema.parse(raw);
  const missing = missingEntitlements(ctx.org.planId, input);
  if (missing.length) throw new EntitlementError(missing[0]);
  if (!(await isHashtagAvailable(input.primaryHashtag))) throw new HashtagTakenError();

  const db = await getDb();
  const id = newId("cmp");
  try {
    const [row] = await db
      .insert(campaigns)
      .values({
        id,
        orgId: ctx.org.id,
        name: input.name,
        primaryHashtag: input.primaryHashtag,
        format: input.format,
        status: "inactive",
        pricingMode: input.pricingMode,
        dailyBudgetCents: input.dailyBudgetCents,
        cpmCapCents: input.cpmCapCents,
        targeting: input.targeting,
        approvals: input.approvals,
        maxCreators: input.maxCreators,
        createdByUserId: ctx.user.id,
      })
      .returning();
    await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "campaign.create", targetType: "campaign", targetId: id });
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new HashtagTakenError();
    throw error;
  }
}

/** Tenant-qualified fetch; returns null for other orgs' campaigns. */
export async function getCampaign(orgId: string, campaignId: string) {
  const db = await getDb();
  const [row] = await db.select().from(campaigns).where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, campaignId))).limit(1);
  return row ?? null;
}

/** Optimistic-concurrency update helper: throws ConflictError if `expectedVersion` is stale. */
export async function updateCampaignVersioned(orgId: string, campaignId: string, expectedVersion: number, patch: Partial<typeof campaigns.$inferInsert>) {
  const db = await getDb();
  const rows = await db
    .update(campaigns)
    .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, campaignId), eq(campaigns.version, expectedVersion)))
    .returning();
  if (!rows.length) throw new ConflictError();
  return rows[0];
}

export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null)?.code ?? (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505";
}
