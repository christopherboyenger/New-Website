import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeCampaign, makeOrg, makePlaybook } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { ConflictError } from "./action-result";
import {
  activateCampaign,
  changeCampaignBudgetForSlug,
  changeCampaignStatusForSlug,
  changePlaybookActiveForSlug,
  pauseCampaign,
  setDailyBudget,
  StatusTransitionError,
} from "./campaign-status";
import { getDb } from "./db/client";
import { auditLog, campaigns, playbooks } from "./db/schema";

async function auditRows(targetId: string) {
  const db = await getDb();
  return db.select().from(auditLog).where(eq(auditLog.targetId, targetId));
}

async function campaignRow(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  return row;
}

describe("campaign status and budget", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("lets an owner activate an inactive campaign, stamping activatedAt, bumping the version and auditing", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    expect(campaign.status).toBe("inactive");
    await signInAs(owner.id);

    const result = await changeCampaignStatusForSlug(org.slug, { campaignId: campaign.id, expectedVersion: campaign.version, status: "active" });
    expect(result).toMatchObject({ ok: true, data: { status: "active", version: campaign.version + 1 } });

    const row = await campaignRow(campaign.id);
    expect(row.status).toBe("active");
    expect(row.activatedAt).toBeInstanceOf(Date);
    const audit = await auditRows(campaign.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ orgId: org.id, actorUserId: owner.id, action: "campaign.activate", targetType: "campaign" });
    expect(audit[0].data).toMatchObject({ from: "inactive", to: "active" });
  });

  it("pauses an active campaign and allows reactivating a paused one", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id, { status: "active" });
    const ctx = { org, user: owner };

    const paused = await pauseCampaign(ctx, { campaignId: campaign.id, expectedVersion: campaign.version });
    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).toBeInstanceOf(Date);

    const reactivated = await activateCampaign(ctx, { campaignId: campaign.id, expectedVersion: paused.version });
    expect(reactivated.status).toBe("active");
    expect((await auditRows(campaign.id)).map((a) => a.action).sort()).toEqual(["campaign.activate", "campaign.pause"]);
  });

  it("rejects transitions the current status does not allow", async () => {
    const { org, owner } = await makeOrg();
    const inactive = await makeCampaign(org.id);
    const active = await makeCampaign(org.id, { status: "active" });
    const ctx = { org, user: owner };
    await expect(pauseCampaign(ctx, { campaignId: inactive.id, expectedVersion: 1 })).rejects.toBeInstanceOf(StatusTransitionError);
    await expect(activateCampaign(ctx, { campaignId: active.id, expectedVersion: 1 })).rejects.toBeInstanceOf(StatusTransitionError);

    await signInAs(owner.id);
    const result = await changeCampaignStatusForSlug(org.slug, { campaignId: inactive.id, expectedVersion: 1, status: "paused" });
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect(await auditRows(inactive.id)).toHaveLength(0);
  });

  it("forbids members from changing status or budget and leaves the campaign unchanged", async () => {
    const { org } = await makeOrg();
    const member = await addMember(org.id, "member");
    const campaign = await makeCampaign(org.id);
    await signInAs(member.id);

    const status = await changeCampaignStatusForSlug(org.slug, { campaignId: campaign.id, expectedVersion: 1, status: "active" });
    expect(status).toMatchObject({ ok: false, code: "forbidden" });
    const budget = await changeCampaignBudgetForSlug(org.slug, { campaignId: campaign.id, expectedVersion: 1, dailyBudgetCents: 900_00 });
    expect(budget).toMatchObject({ ok: false, code: "forbidden" });

    const row = await campaignRow(campaign.id);
    expect([row.status, row.dailyBudgetCents, row.version]).toEqual(["inactive", 500_00, 1]);
  });

  it("treats another workspace's campaign exactly like a missing one", async () => {
    const victim = await makeOrg();
    const campaign = await makeCampaign(victim.org.id);
    const attacker = await makeOrg();
    await signInAs(attacker.owner.id);

    const viaOwnSlug = await changeCampaignStatusForSlug(attacker.org.slug, { campaignId: campaign.id, expectedVersion: 1, status: "active" });
    const missing = await changeCampaignStatusForSlug(attacker.org.slug, { campaignId: "cmp_doesnotexist", expectedVersion: 1, status: "active" });
    expect(viaOwnSlug).toEqual(missing);
    expect(viaOwnSlug).toMatchObject({ ok: false, code: "not_found" });

    const viaVictimSlug = await changeCampaignStatusForSlug(victim.org.slug, { campaignId: campaign.id, expectedVersion: 1, status: "active" });
    expect(viaVictimSlug).toMatchObject({ ok: false, code: "not_found" });
    expect((await campaignRow(campaign.id)).status).toBe("inactive");
  });

  it("refuses a stale version with a ConflictError and does not overwrite", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const ctx = { org, user: owner };
    await setDailyBudget(ctx, { campaignId: campaign.id, expectedVersion: 1, dailyBudgetCents: 600_00 });

    await expect(activateCampaign(ctx, { campaignId: campaign.id, expectedVersion: 1 })).rejects.toBeInstanceOf(ConflictError);
    await signInAs(owner.id);
    const result = await changeCampaignBudgetForSlug(org.slug, { campaignId: campaign.id, expectedVersion: 1, dailyBudgetCents: 700_00 });
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    const row = await campaignRow(campaign.id);
    expect([row.status, row.dailyBudgetCents, row.version]).toEqual(["inactive", 600_00, 2]);
  });

  it("sets the daily average budget, audits old and new amounts, and never changes status", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id, { status: "paused" });
    await signInAs(owner.id);

    const result = await changeCampaignBudgetForSlug(org.slug, { campaignId: campaign.id, expectedVersion: 1, dailyBudgetCents: 1_250_50 });
    expect(result).toMatchObject({ ok: true, data: { dailyBudgetCents: 1_250_50, version: 2 } });
    const row = await campaignRow(campaign.id);
    expect(row.status).toBe("paused");
    const audit = await auditRows(campaign.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "campaign.budget_update", data: { fromCents: 500_00, toCents: 1_250_50 } });
  });

  it("enforces the $50 minimum and whole cents with field errors", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    await signInAs(owner.id);

    const low = await changeCampaignBudgetForSlug(org.slug, { campaignId: campaign.id, expectedVersion: 1, dailyBudgetCents: 49_99 });
    expect(low).toMatchObject({ ok: false, code: "validation", fieldErrors: { dailyBudgetCents: "The minimum daily budget is $50." } });
    const fractional = await changeCampaignBudgetForSlug(org.slug, { campaignId: campaign.id, expectedVersion: 1, dailyBudgetCents: 5000.5 });
    expect(fractional).toMatchObject({ ok: false, code: "validation" });
    const exact = await changeCampaignBudgetForSlug(org.slug, { campaignId: campaign.id, expectedVersion: 1, dailyBudgetCents: 50_00 });
    expect(exact.ok).toBe(true);
  });

  it("treats an unchanged budget as a no-op and refuses manual-pricing campaigns", async () => {
    const { org, owner } = await makeOrg({ planId: "unlimited" });
    const ctx = { org, user: owner };
    const daily = await makeCampaign(org.id);
    const same = await setDailyBudget(ctx, { campaignId: daily.id, expectedVersion: 1, dailyBudgetCents: 500_00 });
    expect(same.version).toBe(1);
    expect(await auditRows(daily.id)).toHaveLength(0);

    const manual = await makeCampaign(org.id, { pricingMode: "manual" });
    await expect(setDailyBudget(ctx, { campaignId: manual.id, expectedVersion: 1, dailyBudgetCents: 600_00 })).rejects.toBeInstanceOf(StatusTransitionError);
  });

  it("will not reactivate Unlimited-only settings on a Standard workspace", async () => {
    const { org, owner } = await makeOrg({ planId: "basic" });
    const campaign = await makeCampaign(org.id, { status: "paused", pricingMode: "manual" });
    await signInAs(owner.id);
    const result = await changeCampaignStatusForSlug(org.slug, { campaignId: campaign.id, expectedVersion: 1, status: "active" });
    expect(result).toMatchObject({ ok: false, code: "entitlement" });
    expect((await campaignRow(campaign.id)).status).toBe("paused");
  });

  it("rejects malformed input without touching the database", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    await signInAs(owner.id);
    const result = await changeCampaignStatusForSlug(org.slug, { campaignId: campaign.id, expectedVersion: "1", status: "launch" });
    expect(result).toMatchObject({ ok: false, code: "validation" });
    expect((await campaignRow(campaign.id)).version).toBe(1);
  });
});

describe("playbook distribution switch", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  async function playbookRow(id: string) {
    const db = await getDb();
    const [row] = await db.select().from(playbooks).where(eq(playbooks.id, id));
    return row;
  }

  it("lets an owner turn a published playbook on and off without bumping its draft version", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const playbook = await makePlaybook(org.id, campaign.id, { status: "published", active: false, publishedRevision: 1 });
    await signInAs(owner.id);

    const on = await changePlaybookActiveForSlug(org.slug, { playbookId: playbook.id, active: true });
    expect(on).toMatchObject({ ok: true, data: { active: true } });
    const off = await changePlaybookActiveForSlug(org.slug, { playbookId: playbook.id, active: false });
    expect(off).toMatchObject({ ok: true, data: { active: false } });

    const row = await playbookRow(playbook.id);
    expect([row.active, row.version, row.status]).toEqual([false, 1, "published"]);
    expect((await auditRows(playbook.id)).map((a) => a.action).sort()).toEqual(["playbook.activate", "playbook.deactivate"]);
  });

  it("has no switch for drafts", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const draft = await makePlaybook(org.id, campaign.id);
    await signInAs(owner.id);
    const result = await changePlaybookActiveForSlug(org.slug, { playbookId: draft.id, active: true });
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect((await playbookRow(draft.id)).active).toBe(false);
  });

  it("reports a toggle already made elsewhere as a conflict", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await makeCampaign(org.id);
    const playbook = await makePlaybook(org.id, campaign.id, { status: "published", active: true });
    await signInAs(owner.id);
    const result = await changePlaybookActiveForSlug(org.slug, { playbookId: playbook.id, active: true });
    expect(result).toMatchObject({ ok: false, code: "conflict" });
  });

  it("requires playbook:publish (members may edit drafts but not distribute)", async () => {
    const { org } = await makeOrg();
    const member = await addMember(org.id, "member");
    const campaign = await makeCampaign(org.id);
    const playbook = await makePlaybook(org.id, campaign.id, { status: "published", active: false });
    await signInAs(member.id);
    const result = await changePlaybookActiveForSlug(org.slug, { playbookId: playbook.id, active: true });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("cannot reach another workspace's playbook", async () => {
    const victim = await makeOrg();
    const campaign = await makeCampaign(victim.org.id);
    const playbook = await makePlaybook(victim.org.id, campaign.id, { status: "published", active: false });
    const attacker = await makeOrg();
    await signInAs(attacker.owner.id);
    const result = await changePlaybookActiveForSlug(attacker.org.slug, { playbookId: playbook.id, active: true });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    const db = await getDb();
    const [row] = await db.select({ active: playbooks.active }).from(playbooks).where(and(eq(playbooks.id, playbook.id)));
    expect(row.active).toBe(false);
  });
});
