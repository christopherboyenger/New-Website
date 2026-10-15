import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { createTestDb } from "../../../tests/support/db";
import { resetRequestContext, signInAs } from "../../../tests/support/request-context";
import { makeCampaign, makeCreator, makeOrg, makePlaybook, makePost, makeUser } from "../../../tests/support/factories";
import { getDb } from "../db/client";
import { auditLog, campaignMemberships, leads, posts, socialAccounts, webhookInbox } from "../db/schema";
import { resetEnvForTesting } from "../env";
import { reviewPostAction } from "./actions";
import { configuredEarningPolicy, earningPolicyConfigured, earningPolicyDecisionsRequired } from "./earnings";
import { listLeads } from "./leads";
import { isOperatorUser, loadOperatorContext, requireOperatorAction, requireOperatorPage, type OperatorContext } from "./operator";
import { loadOpsOverview } from "./overview";
import { listReviewQueue } from "./review";
import { captionHasHashtag, computeObjectiveChecks, type CheckInput } from "./review-checks";
import { listWebhookIssues } from "./webhooks";

const OPERATOR_EMAIL = "operator@example.test";
const previousOperatorEmails = process.env.OPERATOR_EMAILS;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function signInOperator(): Promise<OperatorContext> {
  const operator = await makeUser({ email: OPERATOR_EMAIL });
  await signInAs(operator.id);
  const ctx = await loadOperatorContext();
  if (!ctx) throw new Error("expected operator context");
  return ctx;
}

/** A submitted post that passes every objective check. */
async function makeSubmission(opts: { submittedAt?: Date; caption?: string } = {}) {
  const { org } = await makeOrg({ name: "Brand A" });
  const campaign = await makeCampaign(org.id, { status: "active", primaryHashtag: `summer${Math.random().toString(36).slice(2, 7)}` });
  const playbook = await makePlaybook(org.id, campaign.id);
  const creator = await makeCreator();
  const db = await getDb();
  const [account] = await db
    .insert(socialAccounts)
    .values({ id: newId("acc"), creatorId: creator.id, platform: "tiktok", handle: `h${Math.random().toString(36).slice(2, 9)}`, verification: "verified", verifiedAt: new Date() })
    .returning();
  await db.insert(campaignMemberships).values({ campaignId: campaign.id, creatorId: creator.id, orgId: org.id, status: "approved" });
  const post = await makePost(org.id, creator.id, {
    campaignId: campaign.id,
    playbookId: playbook.id,
    playbookRevision: 2,
    socialAccountId: account.id,
    platform: "tiktok",
    caption: opts.caption ?? `Loving this #${campaign.primaryHashtag} drop`,
    reviewStatus: "submitted",
    submittedAt: opts.submittedAt ?? new Date(),
  });
  return { org, campaign, playbook, creator, account, post };
}

async function postRow(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(posts).where(eq(posts.id, id));
  return row;
}

describe("operator console", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
    process.env.OPERATOR_EMAILS = ` ${OPERATOR_EMAIL.toUpperCase()} , other-op@example.test`;
    resetEnvForTesting();
  });

  afterAll(() => {
    process.env.OPERATOR_EMAILS = previousOperatorEmails;
    resetEnvForTesting();
  });

  describe("authorization", () => {
    it("admits only signed-in, verified, enabled users on the allowlist", async () => {
      expect(isOperatorUser({ email: OPERATOR_EMAIL, emailVerifiedAt: new Date(), disabledAt: null })).toBe(true);
      expect(isOperatorUser({ email: OPERATOR_EMAIL, emailVerifiedAt: null, disabledAt: null })).toBe(false);
      expect(isOperatorUser({ email: OPERATOR_EMAIL, emailVerifiedAt: new Date(), disabledAt: new Date() })).toBe(false);
      expect(isOperatorUser({ email: "someone@example.test", emailVerifiedAt: new Date(), disabledAt: null })).toBe(false);

      await expect(requireOperatorAction()).rejects.toMatchObject({ name: "NotFoundError" });
      await expect(requireOperatorPage()).rejects.toMatchObject({ digest: expect.stringContaining("404") });

      const ctx = await signInOperator();
      expect(ctx.user.email).toBe(OPERATOR_EMAIL);
      await expect(requireOperatorAction()).resolves.toMatchObject({ user: { email: OPERATOR_EMAIL } });
    });

    it("gives a workspace owner who is not an operator a 404, even for their own org's posts", async () => {
      const { org, post } = await makeSubmission();
      await signInAs(org.primaryOwnerUserId);
      await expect(requireOperatorPage()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      const result = await reviewPostAction(null, form({ decision: "approve", postId: post.id }));
      expect(result).toMatchObject({ ok: false, code: "not_found" });
      expect((await postRow(post.id)).reviewStatus).toBe("submitted");
    });

    it("refuses an allowlisted operator whose email is not verified", async () => {
      const { post } = await makeSubmission();
      const unverified = await makeUser({ email: OPERATOR_EMAIL, emailVerifiedAt: null });
      await signInAs(unverified.id);
      expect(await loadOperatorContext()).toBeNull();
      const result = await reviewPostAction(null, form({ decision: "approve", postId: post.id }));
      expect(result).toMatchObject({ ok: false, code: "not_found" });
      expect((await postRow(post.id)).reviewStatus).toBe("submitted");
    });

    it("treats an empty allowlist as no operators", async () => {
      process.env.OPERATOR_EMAILS = "";
      resetEnvForTesting();
      const user = await makeUser({ email: OPERATOR_EMAIL });
      await signInAs(user.id);
      expect(await loadOperatorContext()).toBeNull();
    });
  });

  describe("review queue", () => {
    it("lists submitted posts across organizations, oldest first, with checks and context", async () => {
      const newer = await makeSubmission({ submittedAt: new Date("2026-10-10T00:00:00Z") });
      const older = await makeSubmission({ submittedAt: new Date("2026-10-01T00:00:00Z"), caption: "no hashtag here" });
      const { org } = await makeOrg();
      const creator = await makeCreator();
      await makePost(org.id, creator.id, { reviewStatus: "approved" });
      const operator = await signInOperator();

      const queue = await listReviewQueue(operator, 1);
      expect(queue.total).toBe(2);
      expect(queue.rows.map((r) => r.postId)).toEqual([older.post.id, newer.post.id]);
      const first = queue.rows[0];
      expect(first).toMatchObject({
        org: { id: older.org.id, name: "Brand A" },
        campaign: { id: older.campaign.id, primaryHashtag: older.campaign.primaryHashtag, status: "active" },
        creator: { id: older.creator.id },
        account: { verification: "verified" },
        playbook: { id: older.playbook.id, revision: 2 },
      });
      expect(Object.fromEntries(first.checks.map((c) => [c.key, c.status]))).toMatchObject({ primary_hashtag: "fail", platform_targeted: "pass", creator_admitted: "pass", campaign_status: "pass", account_verified: "pass" });
      expect(queue.rows[1].checks.every((c) => c.status === "pass")).toBe(true);
    });

    it("paginates server-side and clamps out-of-range pages", async () => {
      for (let i = 0; i < 21; i++) await makeSubmission({ submittedAt: new Date(Date.UTC(2026, 9, 1, 0, i)) });
      const operator = await signInOperator();
      const page1 = await listReviewQueue(operator, 1);
      const page2 = await listReviewQueue(operator, 2);
      expect(page1.rows).toHaveLength(20);
      expect(page2.rows).toHaveLength(1);
      expect(page2.rows[0].submittedAt.getTime()).toBeGreaterThan(page1.rows[19].submittedAt.getTime());
      expect((await listReviewQueue(operator, 99)).page).toBe(2);
    });

    it("approves a submitted post, records reviewer/time and an audit entry on the post's org", async () => {
      const { org, post } = await makeSubmission();
      const operator = await signInOperator();
      const result = await reviewPostAction(null, form({ decision: "approve", postId: post.id }));
      expect(result).toMatchObject({ ok: true, data: { postId: post.id, status: "approved" } });
      const row = await postRow(post.id);
      expect(row).toMatchObject({ reviewStatus: "approved", reviewReason: null, reviewedByUserId: operator.user.id });
      expect(row.reviewedAt).toBeInstanceOf(Date);
      const db = await getDb();
      const audits = await db.select().from(auditLog).where(eq(auditLog.targetId, post.id));
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ orgId: org.id, actorUserId: operator.user.id, action: "ops.post.approve", targetType: "post" });
      expect(audits[0].data).toMatchObject({ via: "operator_console", checks: { primary_hashtag: "pass" } });
      expect((await listReviewQueue(operator, 1)).total).toBe(0);
    });

    it("rejects with a required reason, stores it on the post and audits the code", async () => {
      const { org, post } = await makeSubmission({ caption: "forgot the tag" });
      const operator = await signInOperator();

      const missing = await reviewPostAction(null, form({ decision: "reject", postId: post.id }));
      expect(missing).toMatchObject({ ok: false, code: "validation", fieldErrors: { reasonCode: "Choose a rejection reason." } });
      const otherWithoutNote = await reviewPostAction(null, form({ decision: "reject", postId: post.id, reasonCode: "other", note: "  " }));
      expect(otherWithoutNote).toMatchObject({ ok: false, fieldErrors: { note: expect.stringContaining("Other") } });
      const tooLong = await reviewPostAction(null, form({ decision: "reject", postId: post.id, reasonCode: "off_brief", note: "x".repeat(501) }));
      expect(tooLong).toMatchObject({ ok: false, fieldErrors: { note: expect.any(String) } });
      const bogus = await reviewPostAction(null, form({ decision: "reject", postId: post.id, reasonCode: "made_up" }));
      expect(bogus).toMatchObject({ ok: false, code: "validation" });
      expect((await postRow(post.id)).reviewStatus).toBe("submitted");

      const result = await reviewPostAction(null, form({ decision: "reject", postId: post.id, reasonCode: "missing_primary_hashtag", note: "Add the tag and resubmit." }));
      expect(result).toMatchObject({ ok: true, data: { status: "rejected" } });
      const row = await postRow(post.id);
      expect(row).toMatchObject({ reviewStatus: "rejected", reviewReason: "Missing the campaign’s primary hashtag — Add the tag and resubmit.", reviewedByUserId: operator.user.id });
      const db = await getDb();
      const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, post.id), eq(auditLog.action, "ops.post.reject")));
      expect(audit).toMatchObject({ orgId: org.id });
      expect(audit.data).toMatchObject({ reasonCode: "missing_primary_hashtag", checks: { primary_hashtag: "fail" } });
    });

    it("returns a conflict for an already-reviewed post and never writes a second decision", async () => {
      const { post } = await makeSubmission();
      await signInOperator();
      expect((await reviewPostAction(null, form({ decision: "approve", postId: post.id }))).ok).toBe(true);
      const again = await reviewPostAction(null, form({ decision: "approve", postId: post.id }));
      expect(again).toMatchObject({ ok: false, code: "conflict", error: expect.stringContaining("already approved") });
      const flip = await reviewPostAction(null, form({ decision: "reject", postId: post.id, reasonCode: "duplicate" }));
      expect(flip).toMatchObject({ ok: false, code: "conflict" });
      expect((await postRow(post.id)).reviewStatus).toBe("approved");
      const db = await getDb();
      expect(await db.select().from(auditLog).where(eq(auditLog.targetId, post.id))).toHaveLength(1);
    });

    it("reports an unknown post as not found", async () => {
      await signInOperator();
      expect(await reviewPostAction(null, form({ decision: "approve", postId: "pst_missing" }))).toMatchObject({ ok: false, code: "not_found" });
    });
  });

  describe("objective checks", () => {
    const base: CheckInput = {
      caption: "Try it #Glow",
      platform: "tiktok",
      campaign: { primaryHashtag: "glow", status: "active", targetPlatforms: [], requireCreatorApproval: false },
      admissionStatus: null,
      account: { verification: "verified", ownedBySubmitter: true, platform: "tiktok" },
    };
    const statuses = (input: CheckInput) => Object.fromEntries(computeObjectiveChecks(input).map((c) => [c.key, c.status]));

    it("matches the primary hashtag as a whole tag, case-insensitively", () => {
      expect(captionHasHashtag("Try it #GLOW!", "glow")).toBe(true);
      expect(captionHasHashtag("#glow", "#glow")).toBe(true);
      expect(captionHasHashtag("so #glowing", "glow")).toBe(false);
      expect(captionHasHashtag("glow without hash", "glow")).toBe(false);
      expect(captionHasHashtag("x##glow", "glow")).toBe(false);
      expect(captionHasHashtag("a.b #a.b", "a.b")).toBe(true);
    });

    it("passes a compliant post and explains each failure", () => {
      expect(Object.values(statuses(base)).every((s) => s === "pass")).toBe(true);
      expect(statuses({ ...base, caption: "nothing" }).primary_hashtag).toBe("fail");
      expect(statuses({ ...base, campaign: { ...base.campaign!, targetPlatforms: ["instagram"] } }).platform_targeted).toBe("fail");
      expect(statuses({ ...base, campaign: { ...base.campaign!, targetPlatforms: ["tiktok", "youtube"] } }).platform_targeted).toBe("pass");
      expect(statuses({ ...base, campaign: { ...base.campaign!, status: "paused" } }).campaign_status).toBe("warn");
      expect(statuses({ ...base, account: null }).account_verified).toBe("fail");
      expect(statuses({ ...base, account: { ...base.account!, verification: "pending" } }).account_verified).toBe("fail");
      expect(statuses({ ...base, account: { ...base.account!, ownedBySubmitter: false } }).account_verified).toBe("fail");
      expect(statuses({ ...base, account: { ...base.account!, platform: "youtube" } }).account_verified).toBe("fail");
    });

    it("distinguishes admission approval from post review", () => {
      const approvalRequired = { ...base, campaign: { ...base.campaign!, requireCreatorApproval: true } };
      expect(statuses(approvalRequired).creator_admitted).toBe("fail");
      expect(statuses({ ...approvalRequired, admissionStatus: "requested" }).creator_admitted).toBe("fail");
      expect(statuses({ ...approvalRequired, admissionStatus: "approved" }).creator_admitted).toBe("pass");
      expect(statuses({ ...base, admissionStatus: "removed" }).creator_admitted).toBe("fail");
      expect(statuses(base).creator_admitted).toBe("pass");
    });

    it("fails campaign-dependent checks for unattributed posts", () => {
      const s = statuses({ ...base, campaign: null });
      expect(s).toMatchObject({ primary_hashtag: "fail", platform_targeted: "fail", creator_admitted: "fail", campaign_status: "fail" });
    });
  });

  describe("operations views", () => {
    it("lists quarantined/failed webhooks without payloads", async () => {
      const db = await getDb();
      const base = { environment: "test", payloadSha256: "abc", payload: { secret: "whsec_should_not_leak" } };
      await db.insert(webhookInbox).values([
        { id: newId("whk"), provider: "stripe", eventId: "evt_1", eventType: "invoice.paid", status: "quarantined", lastError: "unknown account", receivedAt: new Date("2026-10-01T00:00:00Z"), ...base },
        { id: newId("whk"), provider: "stripe", eventId: "evt_2", eventType: "charge.failed", status: "failed", lastError: "x".repeat(400), receivedAt: new Date("2026-10-02T00:00:00Z"), ...base },
        { id: newId("whk"), provider: "stripe", eventId: "evt_3", eventType: "charge.succeeded", status: "processed", ...base },
      ]);
      const operator = await signInOperator();
      const all = await listWebhookIssues(operator, "all", 1);
      expect(all.rows.map((r) => r.eventId)).toEqual(["evt_2", "evt_1"]);
      expect(JSON.stringify(all)).not.toContain("whsec_should_not_leak");
      expect(all.rows[0].lastError!.length).toBeLessThanOrEqual(241);
      expect((await listWebhookIssues(operator, "quarantined", 1)).rows.map((r) => r.eventId)).toEqual(["evt_1"]);
    });

    it("lists leads newest first and summarizes counts honestly", async () => {
      const db = await getDb();
      await db.insert(leads).values([
        { id: newId("lead"), email: "a@brand.test", companyName: "A Co", budgetBand: "$0 – $50K", ctaSource: "hero", stepReached: 2, createdAt: new Date("2026-01-01T00:00:00Z") },
        { id: newId("lead"), email: "b@brand.test", stepReached: 1 },
      ]);
      const operator = await signInOperator();
      const list = await listLeads(operator, 1);
      expect(list.rows.map((r) => r.email)).toEqual(["b@brand.test", "a@brand.test"]);
      const overview = await loadOpsOverview(operator);
      expect(overview).toMatchObject({ review: { submitted: 0, oldestSubmittedAt: null }, webhooks: { quarantined: 0, failed: 0 }, leads: { total: 2, last7Days: 1 }, earningsConfigured: false });
      expect(overview.workspaces).toBe(0);
    });
  });

  it("has no earning policy configured, so no earning job may run", () => {
    expect(configuredEarningPolicy()).toBeNull();
    expect(earningPolicyConfigured()).toBe(false);
    expect(earningPolicyDecisionsRequired().length).toBeGreaterThan(0);
  });
});
