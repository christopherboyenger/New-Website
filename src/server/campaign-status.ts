import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { MIN_DAILY_BUDGET_CENTS } from "@/domain/campaign";
import { EntitlementError, missingEntitlements } from "@/domain/entitlements";
import { formatUsd } from "@/lib/money";
import { ConflictError, fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { NotFoundError, requireOrgAction, type CommandContext } from "./authz";
import { getCampaign, MAX_DAILY_BUDGET_CENTS, updateCampaignVersioned } from "./campaigns-core";
import { getDb } from "./db/client";
import { campaigns, playbooks } from "./db/schema";
import { getPlaybook } from "./playbooks-core";

/**
 * Campaign status and budget, and playbook distribution — the only writes the
 * Organic tables make. Each is an explicit, confirmed user action: nothing here
 * runs as a side effect of another edit, and nothing charges or publishes.
 *
 * Documented rules (reference-build-specification.md §3): campaigns begin
 * inactive; activation makes them visible to creators; pausing stops spending
 * and earning for ALL posts, including posts made before the pause. The daily
 * budget is an average target (minimum $50), not a cap (DEC-015).
 *
 * Commands take a CommandContext whose org came from requireOrgAction; the
 * `*ForSlug` entry points perform that authorization and map errors to
 * ActionResult for Server Actions.
 */

/** A transition the entity's current state does not allow (e.g. pausing an inactive campaign). */
export class StatusTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatusTransitionError";
  }
}

type Campaign = typeof campaigns.$inferSelect;

async function loadForUpdate(ctx: CommandContext, campaignId: string, expectedVersion: number): Promise<Campaign> {
  const campaign = await getCampaign(ctx.org.id, campaignId);
  if (!campaign) throw new NotFoundError("Campaign not found.");
  if (campaign.version !== expectedVersion) throw new ConflictError("This campaign was changed elsewhere. Reload to see its current status and budget.");
  return campaign;
}

export interface VersionedCampaignInput {
  campaignId: string;
  /** The version the user saw when they confirmed (optimistic concurrency). */
  expectedVersion: number;
}

/**
 * inactive|paused → active. The campaign's settings must still be within the
 * workspace plan (a downgraded workspace cannot reactivate Unlimited-only settings).
 */
export async function activateCampaign(ctx: CommandContext, input: VersionedCampaignInput): Promise<Campaign> {
  const campaign = await loadForUpdate(ctx, input.campaignId, input.expectedVersion);
  if (campaign.status === "active") throw new StatusTransitionError("This campaign is already active.");
  const missing = missingEntitlements(ctx.org.planId, campaign);
  if (missing.length) throw new EntitlementError(missing[0]);
  const updated = await updateCampaignVersioned(ctx.org.id, campaign.id, input.expectedVersion, { status: "active", activatedAt: new Date() });
  await recordAudit({
    orgId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "campaign.activate",
    targetType: "campaign",
    targetId: campaign.id,
    data: { from: campaign.status, to: "active", version: updated.version },
  });
  return updated;
}

/** active → paused. Stops spending and earning for every post of the campaign. */
export async function pauseCampaign(ctx: CommandContext, input: VersionedCampaignInput): Promise<Campaign> {
  const campaign = await loadForUpdate(ctx, input.campaignId, input.expectedVersion);
  if (campaign.status !== "active") {
    throw new StatusTransitionError(
      campaign.status === "paused" ? "This campaign is already paused." : "This campaign hasn't been activated, so there is nothing to pause.",
    );
  }
  const updated = await updateCampaignVersioned(ctx.org.id, campaign.id, input.expectedVersion, { status: "paused", pausedAt: new Date() });
  await recordAudit({
    orgId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "campaign.pause",
    targetType: "campaign",
    targetId: campaign.id,
    data: { from: "active", to: "paused", version: updated.version },
  });
  return updated;
}

export const dailyBudgetSchema = z
  .number({ message: "Enter a daily budget in dollars." })
  .int("Enter whole cents.")
  .min(MIN_DAILY_BUDGET_CENTS, `The minimum daily budget is ${formatUsd(MIN_DAILY_BUDGET_CENTS)}.`)
  .max(MAX_DAILY_BUDGET_CENTS, "That budget is above the allowed maximum.");

/**
 * Changes the Daily-mode average budget. Never changes status; an unchanged
 * value is a no-op (no version bump, no audit row).
 */
export async function setDailyBudget(ctx: CommandContext, input: VersionedCampaignInput & { dailyBudgetCents: number }): Promise<Campaign> {
  const cents = dailyBudgetSchema.parse(input.dailyBudgetCents);
  const campaign = await loadForUpdate(ctx, input.campaignId, input.expectedVersion);
  if (campaign.pricingMode !== "daily") throw new StatusTransitionError("This campaign uses manual pricing, which has no daily average budget.");
  if (campaign.dailyBudgetCents === cents) return campaign;
  const updated = await updateCampaignVersioned(ctx.org.id, campaign.id, input.expectedVersion, { dailyBudgetCents: cents });
  await recordAudit({
    orgId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "campaign.budget_update",
    targetType: "campaign",
    targetId: campaign.id,
    data: {
      fromCents: campaign.dailyBudgetCents,
      toCents: cents,
      version: updated.version,
    },
  });
  return updated;
}

/**
 * Turns a PUBLISHED playbook's distribution on or off. Creators only see an
 * active playbook while its campaign is active. Drafts have no distribution
 * switch. The draft `version` is deliberately untouched so an open editor's
 * next save does not conflict; the compare-and-set on `active` detects a
 * toggle made elsewhere instead.
 */
export async function setPlaybookActive(ctx: CommandContext, input: { playbookId: string; active: boolean }) {
  const playbook = await getPlaybook(ctx.org.id, input.playbookId);
  if (!playbook) throw new NotFoundError("Playbook not found.");
  if (playbook.status !== "published") throw new StatusTransitionError("Publish this playbook before turning it on. Drafts are never shown to creators.");
  if (playbook.active === input.active) {
    throw new ConflictError(`This playbook was already turned ${input.active ? "on" : "off"} elsewhere. Reload to see its current state.`);
  }
  const db = await getDb();
  const [updated] = await db
    .update(playbooks)
    .set({ active: input.active })
    .where(and(eq(playbooks.orgId, ctx.org.id), eq(playbooks.id, playbook.id), eq(playbooks.status, "published"), eq(playbooks.active, !input.active)))
    .returning();
  if (!updated) throw new ConflictError("This playbook was changed elsewhere. Reload to see its current state.");
  await recordAudit({
    orgId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: input.active ? "playbook.activate" : "playbook.deactivate",
    targetType: "playbook",
    targetId: playbook.id,
    data: { campaignId: playbook.campaignId },
  });
  return updated;
}

/* ----------------------------------------------------------------------------
 * Authorized entry points (called by Server Actions)
 * ------------------------------------------------------------------------- */

const idSchema = z.string().trim().min(1).max(64);
const versionSchema = z.number().int().min(1);

const statusInputSchema = z.object({
  campaignId: idSchema,
  expectedVersion: versionSchema,
  status: z.enum(["active", "paused"]),
});

const budgetInputSchema = z.object({
  campaignId: idSchema,
  expectedVersion: versionSchema,
  dailyBudgetCents: dailyBudgetSchema,
});

const playbookActiveInputSchema = z.object({
  playbookId: idSchema,
  active: z.boolean(),
});

export interface CampaignStatusResult {
  status: Campaign["status"];
  version: number;
}

export interface CampaignBudgetResult {
  dailyBudgetCents: number;
  version: number;
}

async function guarded<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return runAction(async () => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof StatusTransitionError) return fail(error.message, "conflict");
      if (error instanceof z.ZodError) return fromZodError(error);
      throw error;
    }
  });
}

/** Activate or pause (campaign:manage). */
export async function changeCampaignStatusForSlug(slug: string, raw: unknown): Promise<ActionResult<CampaignStatusResult>> {
  return guarded(async () => {
    const ctx = await requireOrgAction(slug, "campaign:manage");
    const parsed = statusInputSchema.safeParse(raw);
    if (!parsed.success) return fromZodError(parsed.error, "That request was not valid. Reload and try again.");
    const { status, ...input } = parsed.data;
    const updated = status === "active" ? await activateCampaign(ctx, input) : await pauseCampaign(ctx, input);
    return ok({ status: updated.status, version: updated.version }, status === "active" ? `${updated.name} is active.` : `${updated.name} is paused.`);
  });
}

/** Set the daily average budget (campaign:manage). */
export async function changeCampaignBudgetForSlug(slug: string, raw: unknown): Promise<ActionResult<CampaignBudgetResult>> {
  return guarded(async () => {
    const ctx = await requireOrgAction(slug, "campaign:manage");
    const parsed = budgetInputSchema.safeParse(raw);
    if (!parsed.success) return fromZodError(parsed.error);
    const updated = await setDailyBudget(ctx, parsed.data);
    return ok(
      { dailyBudgetCents: updated.dailyBudgetCents, version: updated.version },
      `Daily budget set to ${formatUsd(updated.dailyBudgetCents, { decimals: 2 })} average.`,
    );
  });
}

/** Turn a published playbook on or off (playbook:publish). */
export async function changePlaybookActiveForSlug(slug: string, raw: unknown): Promise<ActionResult<{ active: boolean }>> {
  return guarded(async () => {
    const ctx = await requireOrgAction(slug, "playbook:publish");
    const parsed = playbookActiveInputSchema.safeParse(raw);
    if (!parsed.success) return fromZodError(parsed.error, "That request was not valid. Reload and try again.");
    const updated = await setPlaybookActive(ctx, parsed.data);
    return ok({ active: updated.active }, updated.active ? `${updated.name} is on.` : `${updated.name} is off.`);
  });
}
