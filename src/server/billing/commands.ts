import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { commercialPolicy } from "@/config/commercial-policy";
import { ConflictError, fail, fromZodError, ok, runAction, type ActionResult } from "../action-result";
import { recordAudit } from "../audit";
import { requireOrgAction } from "../authz";
import { getDb } from "../db/client";
import { billingAccounts, organizations } from "../db/schema";
import {
  getPaymentReadiness,
  reconcilePaymentSetup,
  startPaymentMethodSetup,
  startPlanManagement,
  startPlanUpgrade,
  type PaymentReadiness,
  type PaymentSetupStart,
  type PlanUpgradeStart,
} from "./payment-setup";
import { ensureBillingAccount } from "./provider";
import { businessAddressFields, type BusinessAddress } from "./rules";

/**
 * Billing page commands. Each one re-authorizes from the URL slug with
 * requireOrgAction (owner-only `billing:manage`, or `billing:view` for
 * read-only status checks); the organization and provider customer always
 * come from the authorized context, never from client input. None of these
 * charge: card setup and upgrades happen on provider-hosted pages.
 */

export async function beginPaymentMethodSetup(slug: string): Promise<ActionResult<PaymentSetupStart>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "billing:manage");
    return ok(await startPaymentMethodSetup(ctx, { returnPath: `/home/${ctx.org.slug}/billing` }));
  });
}

export async function refreshPaymentStatus(slug: string): Promise<ActionResult<PaymentReadiness>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "billing:view");
    try {
      return ok(await reconcilePaymentSetup(ctx));
    } catch {
      // The provider could not be reached; report the stored state rather than guessing.
      return ok(await getPaymentReadiness(ctx.org.id), "The payment provider couldn't be reached. Showing the last confirmed status.");
    }
  });
}

export async function beginPlanUpgrade(slug: string): Promise<ActionResult<PlanUpgradeStart>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "billing:manage");
    return ok(await startPlanUpgrade(ctx));
  });
}

export async function beginPlanManagement(slug: string): Promise<ActionResult<PaymentSetupStart>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "billing:manage");
    return ok(await startPlanManagement(ctx));
  });
}

/* ----------------------------------------------------------------------------
 * Charge threshold
 * ------------------------------------------------------------------------- */

const thresholdOptions = commercialPolicy.billingThresholdOptionsCents as readonly number[];

export const thresholdSchema = z.object({
  expectedVersion: z.number().int().positive(),
  thresholdCents: z
    .number()
    .int()
    .refine((v) => thresholdOptions.includes(v), "Choose one of the listed thresholds."),
});

export async function updateBillingThreshold(slug: string, input: unknown): Promise<ActionResult<{ thresholdCents: number; version: number }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "billing:manage");
    const parsed = thresholdSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { thresholdCents, expectedVersion } = parsed.data;

    const db = await getDb();
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(organizations)
        .set({ billingThresholdCents: thresholdCents, updatedAt: new Date(), version: sql`${organizations.version} + 1` })
        .where(and(eq(organizations.id, ctx.org.id), eq(organizations.version, expectedVersion)))
        .returning({ billingThresholdCents: organizations.billingThresholdCents, version: organizations.version });
      if (rows.length === 0) throw new ConflictError("Workspace settings changed since you opened this page. Reload to see the current threshold before changing it.");
      await recordAudit(
        {
          orgId: ctx.org.id,
          actorUserId: ctx.user.id,
          action: "billing.threshold.update",
          targetType: "organization",
          targetId: ctx.org.id,
          data: { from: ctx.org.billingThresholdCents, to: thresholdCents },
        },
        tx,
      );
      return rows[0];
    });
    return ok({ thresholdCents: updated.billingThresholdCents, version: updated.version }, "Billing threshold saved.");
  });
}

/* ----------------------------------------------------------------------------
 * Business information
 * ------------------------------------------------------------------------- */

export interface BusinessInformation {
  businessName: string;
  address: BusinessAddress;
  taxId: string;
}

const optionalText = (max: number) => z.string().trim().max(max, `Use ${max} characters or fewer.`);

export const businessInfoSchema = z.object({
  revision: z.string().min(1),
  businessName: z.string().trim().min(1, "Enter the business name.").max(120, "Use 120 characters or fewer."),
  line1: optionalText(120),
  line2: optionalText(120),
  city: optionalText(80),
  region: optionalText(80),
  postalCode: optionalText(20),
  country: optionalText(60),
  taxId: z
    .string()
    .trim()
    .max(40, "Use 40 characters or fewer.")
    .refine((v) => v === "" || /^[A-Za-z0-9][A-Za-z0-9 .\-/]*$/.test(v), "Use letters, numbers, spaces, dots, dashes or slashes."),
});

export function businessInformationOf(row: { businessName: string | null; businessAddress: Record<string, string> | null; taxId: string | null } | null): BusinessInformation {
  const address: BusinessAddress = {};
  for (const field of businessAddressFields) {
    const value = row?.businessAddress?.[field];
    if (value) address[field] = value;
  }
  return { businessName: row?.businessName ?? "", address, taxId: row?.taxId ?? "" };
}

/** Opaque revision of the stored business information, for optimistic concurrency. */
export function businessRevision(info: BusinessInformation): string {
  return createHash("sha256").update(JSON.stringify(info)).digest("hex").slice(0, 32);
}

export async function updateBusinessInformation(slug: string, input: unknown): Promise<ActionResult<{ info: BusinessInformation; revision: string }>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "billing:manage");
    const parsed = businessInfoSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const data = parsed.data;
    const address: BusinessAddress = {};
    for (const field of businessAddressFields) if (data[field]) address[field] = data[field];
    if ((address.line1 || address.city || address.postalCode) && !address.country) {
      return fail("Check the highlighted fields.", "validation", { country: "Enter the country for this address." });
    }
    const next: BusinessInformation = { businessName: data.businessName, address, taxId: data.taxId };

    await ensureBillingAccount(ctx.org.id);
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(billingAccounts).where(eq(billingAccounts.orgId, ctx.org.id)).for("update").limit(1);
      if (businessRevision(businessInformationOf(current ?? null)) !== data.revision) {
        throw new ConflictError("Business information changed since you opened it. Reload to see the latest details before saving again.");
      }
      await tx
        .update(billingAccounts)
        .set({ businessName: next.businessName, businessAddress: Object.keys(address).length ? (address as Record<string, string>) : null, taxId: next.taxId || null, updatedAt: new Date() })
        .where(eq(billingAccounts.orgId, ctx.org.id));
      await recordAudit({ orgId: ctx.org.id, actorUserId: ctx.user.id, action: "billing.business_info.update", targetType: "billing_account", targetId: ctx.org.id }, tx);
    });
    return ok({ info: next, revision: businessRevision(next) }, "Business information saved.");
  });
}
