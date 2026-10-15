"use server";

/**
 * Server Actions behind /home/{org}/playbooks/{id}/edit (L05–L07 and the
 * documented slideshow format).
 *
 * Every action re-authorizes from the URL slug and only touches rows of the
 * authorized organization. Draft saves use optimistic concurrency on
 * `playbooks.version` and never publish, activate or charge. Publishing is an
 * explicit owner action that freezes a revision; it never activates the
 * campaign and never charges.
 */
import "server-only";
import { and, desc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { commercialPolicy } from "@/config/commercial-policy";
import type { CampaignStatus } from "@/domain/campaign";
import type { ContentFormat, PlaybookContent } from "@/domain/playbook-content";
import { draftPayloadSchema, publishIssues, snapshotsDiffer, type DraftPayload, type PublishIssue } from "@/domain/playbook-validation";
import { newId } from "@/lib/ids";
import { ConflictError, fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { recordAudit } from "./audit";
import { hasPermission, NotFoundError, requireOrgAction } from "./authz";
import { getPaymentReadiness } from "./billing/payment-setup";
import { getDb, type DbLike } from "./db/client";
import { campaigns, playbookRevisions, playbooks } from "./db/schema";
import { getPlaybook } from "./playbooks-core";
import { capability } from "./readiness";

const UNTITLED = "Untitled playbook";

export interface PaymentGate {
  /** Whether commercial policy requires a ready payment method to publish. */
  required: boolean;
  ready: boolean;
  /** Whether this deployment can collect cards at all. */
  providerConfigured: boolean;
  /** Billing route; null when the viewer cannot open Billing. */
  billingHref: string | null;
  message: string | null;
}

export interface PlaybookEditorData {
  org: { slug: string; name: string };
  playbook: {
    id: string;
    name: string;
    format: ContentFormat;
    status: "draft" | "published";
    active: boolean;
    version: number;
    templateId: string | null;
    publishedRevision: number | null;
    publishedAt: string | null;
    content: PlaybookContent;
    descriptions: string[];
    hashtags: string[];
    hasUnpublishedChanges: boolean;
  };
  campaign: {
    id: string;
    name: string;
    primaryHashtag: string;
    status: CampaignStatus;
  };
  canEdit: boolean;
  canPublish: boolean;
  /** Only resolved for viewers who may publish. */
  payment: PaymentGate | null;
  mediaStorage: { configured: boolean; detail: string };
  aiAuthoring: { configured: boolean; detail: string };
}

export interface SavedDraft {
  version: number;
  updatedAt: string;
  name: string;
  hasUnpublishedChanges: boolean;
}

export interface PublishedPlaybook {
  revision: number;
  active: boolean;
  publishedAt: string;
}

/* ------------------------------------------------------------------ helpers */

async function loadCampaign(db: DbLike, orgId: string, campaignId: string) {
  const [row] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      primaryHashtag: campaigns.primaryHashtag,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, campaignId)))
    .limit(1);
  return row ?? null;
}

async function latestRevision(db: DbLike, orgId: string, playbookId: string, revision: number | null) {
  if (revision === null) return null;
  const [row] = await db
    .select({
      name: playbookRevisions.name,
      content: playbookRevisions.content,
      descriptions: playbookRevisions.descriptions,
      hashtags: playbookRevisions.hashtags,
    })
    .from(playbookRevisions)
    .where(and(eq(playbookRevisions.orgId, orgId), eq(playbookRevisions.playbookId, playbookId), eq(playbookRevisions.revision, revision)))
    .orderBy(desc(playbookRevisions.revision))
    .limit(1);
  return row ?? null;
}

type PlaybookRow = typeof playbooks.$inferSelect;

async function hasUnpublishedChanges(db: DbLike, row: PlaybookRow): Promise<boolean> {
  if (row.status !== "published") return false;
  const published = await latestRevision(db, row.orgId, row.id, row.publishedRevision);
  if (!published) return false;
  return snapshotsDiffer(row, published);
}

async function paymentGate(orgId: string, slug: string, canViewBilling: boolean): Promise<PaymentGate> {
  const required = commercialPolicy.publishing.requiresPaymentMethod;
  const providerConfigured = capability("payments").configured;
  const billingHref = canViewBilling ? `/home/${slug}/billing` : null;
  if (!required)
    return {
      required,
      ready: true,
      providerConfigured,
      billingHref,
      message: null,
    };
  const readiness = await getPaymentReadiness(orgId);
  const ready = readiness.status === "ready";
  let message: string | null = null;
  if (!ready) {
    message = providerConfigured
      ? readiness.status === "pending"
        ? "Your payment method is still being confirmed. You can publish once Billing shows it as ready."
        : "Add a payment method in Billing before publishing. Publishing itself doesn't charge anything."
      : "Publishing needs a payment method on file, and card payments aren't configured on this deployment yet, so one can't be added.";
  }
  return { required, ready, providerConfigured, billingHref, message };
}

function revalidate(slug: string, id: string) {
  revalidatePath(`/home/${slug}/campaigns`);
  revalidatePath(`/home/${slug}/playbooks/${id}/edit`);
}

function editorPlaybook(row: PlaybookRow, unpublished: boolean): PlaybookEditorData["playbook"] {
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    status: row.status,
    active: row.active,
    version: row.version,
    templateId: row.templateId,
    publishedRevision: row.publishedRevision,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    content: row.content,
    descriptions: row.descriptions,
    hashtags: row.hashtags,
    hasUnpublishedChanges: unpublished,
  };
}

/* ------------------------------------------------------------------ actions */

/** Everything the editor needs. Non-member and unknown playbooks are indistinguishable (not_found). */
export async function loadPlaybookEditor(slug: string, playbookId: string): Promise<ActionResult<PlaybookEditorData>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "workspace:read");
    const row = await getPlaybook(ctx.org.id, playbookId);
    if (!row) throw new NotFoundError("Playbook not found.");
    const db = await getDb();
    const campaign = await loadCampaign(db, ctx.org.id, row.campaignId);
    if (!campaign) throw new NotFoundError("Playbook not found.");
    const canPublish = hasPermission(ctx, "playbook:publish");
    const media = capability("media_storage");
    const ai = capability("ai_authoring");
    return ok({
      org: { slug: ctx.org.slug, name: ctx.org.name },
      playbook: editorPlaybook(row, await hasUnpublishedChanges(db, row)),
      campaign,
      canEdit: hasPermission(ctx, "playbook:edit"),
      canPublish,
      payment: canPublish ? await paymentGate(ctx.org.id, ctx.org.slug, hasPermission(ctx, "billing:view")) : null,
      mediaStorage: { configured: media.configured, detail: media.detail },
      aiAuthoring: { configured: ai.configured, detail: ai.detail },
    });
  });
}

/** Re-reads the latest saved draft (used by "Reload latest" after a conflict). */
export async function loadLatestDraft(slug: string, playbookId: string): Promise<ActionResult<PlaybookEditorData["playbook"]>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "playbook:edit");
    const row = await getPlaybook(ctx.org.id, playbookId);
    if (!row) throw new NotFoundError("Playbook not found.");
    const db = await getDb();
    return ok(editorPlaybook(row, await hasUnpublishedChanges(db, row)));
  });
}

/**
 * Saves the working draft (name, content, descriptions, hashtags). Requires
 * `expectedVersion` to match the stored version; otherwise nothing is written
 * and a conflict is returned. Never publishes, activates or charges.
 */
export async function saveDraft(slug: string, playbookId: string, expectedVersion: number, payload: DraftPayload): Promise<ActionResult<SavedDraft>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "playbook:edit");
    const db = await getDb();
    const row = await getPlaybook(ctx.org.id, playbookId);
    if (!row) throw new NotFoundError("Playbook not found.");
    const campaign = await loadCampaign(db, ctx.org.id, row.campaignId);
    if (!campaign) throw new NotFoundError("Playbook not found.");
    if (!Number.isInteger(expectedVersion)) return fail("Reload the editor and try again.", "validation");

    const parsed = draftPayloadSchema(row.format, campaign.primaryHashtag).safeParse(payload);
    if (!parsed.success) return fromZodError(parsed.error, "Some fields need attention before this draft can be saved.");
    const data = parsed.data;

    const [updated] = await db
      .update(playbooks)
      .set({
        name: data.name || UNTITLED,
        templateId: data.templateId,
        content: data.content as PlaybookContent,
        descriptions: data.descriptions,
        hashtags: data.hashtags,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(playbooks.orgId, ctx.org.id), eq(playbooks.id, playbookId), eq(playbooks.version, expectedVersion)))
      .returning();
    if (!updated) throw new ConflictError("This playbook was changed in another tab or by a teammate. Reload the latest version before saving again.");

    revalidate(ctx.org.slug, playbookId);
    return ok({
      version: updated.version,
      updatedAt: updated.updatedAt.toISOString(),
      name: updated.name,
      hasUnpublishedChanges: await hasUnpublishedChanges(db, updated),
    });
  });
}

/**
 * Publishes the saved draft as a new frozen revision. Owner-only, validated,
 * and gated on payment readiness when commercial policy requires it.
 * `makeActive` is the explicit confirmation-dialog choice; publishing never
 * changes the campaign's status and never charges.
 */
export async function publishPlaybook(
  slug: string,
  playbookId: string,
  expectedVersion: number,
  options: { makeActive: boolean },
): Promise<ActionResult<PublishedPlaybook>> {
  return runAction(async () => {
    const ctx = await requireOrgAction(slug, "playbook:publish");
    const db = await getDb();
    const row = await getPlaybook(ctx.org.id, playbookId);
    if (!row) throw new NotFoundError("Playbook not found.");
    if (row.version !== expectedVersion) {
      throw new ConflictError("This playbook changed since you opened it. Reload the latest version, review it, then publish.");
    }
    const campaign = await loadCampaign(db, ctx.org.id, row.campaignId);

    const issues: PublishIssue[] = publishIssues({
      name: row.name,
      content: row.content,
      descriptions: row.descriptions,
      campaign,
    });
    if (issues.length > 0) {
      return fail("This playbook isn't ready to publish yet.", "validation", Object.fromEntries(issues.map((i) => [i.key, i.message])));
    }

    const gate = await paymentGate(ctx.org.id, ctx.org.slug, hasPermission(ctx, "billing:view"));
    if (!gate.ready) return fail(gate.message ?? "A payment method is required before publishing.", gate.providerConfigured ? "validation" : "not_configured");

    const makeActive = options.makeActive === true;
    const published = await db.transaction(async (tx) => {
      const [{ current }] = await tx
        .select({ current: max(playbookRevisions.revision) })
        .from(playbookRevisions)
        .where(and(eq(playbookRevisions.orgId, ctx.org.id), eq(playbookRevisions.playbookId, row.id)));
      const revision = (current ?? 0) + 1;
      const publishedAt = new Date();
      const [claimed] = await tx
        .update(playbooks)
        .set({
          status: "published",
          publishedRevision: revision,
          publishedAt,
          active: makeActive,
          updatedAt: publishedAt,
        })
        .where(and(eq(playbooks.orgId, ctx.org.id), eq(playbooks.id, row.id), eq(playbooks.version, expectedVersion)))
        .returning({ id: playbooks.id });
      if (!claimed) throw new ConflictError("This playbook changed while publishing. Reload the latest version, review it, then publish.");
      await tx.insert(playbookRevisions).values({
        id: newId("rev"),
        playbookId: row.id,
        orgId: ctx.org.id,
        revision,
        name: row.name,
        content: structuredClone(row.content),
        descriptions: [...row.descriptions],
        hashtags: [...row.hashtags],
        publishedAt,
        publishedByUserId: ctx.user.id,
      });
      await recordAudit(
        {
          orgId: ctx.org.id,
          actorUserId: ctx.user.id,
          action: "playbook.publish",
          targetType: "playbook",
          targetId: row.id,
          data: { revision, active: makeActive },
        },
        tx,
      );
      return {
        revision,
        active: makeActive,
        publishedAt: publishedAt.toISOString(),
      };
    });

    revalidate(ctx.org.slug, playbookId);
    return ok(published, `Published revision ${published.revision}.`);
  });
}
