import "server-only";
import { and, eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { emptyContent, type PlaybookContent } from "@/domain/playbook-content";
import { findTemplate } from "@/domain/playbook-templates";
import { recordAudit } from "./audit";
import type { CommandContext } from "./authz";
import { NotFoundError } from "./authz";
import { getDb } from "./db/client";
import { campaigns, playbooks } from "./db/schema";

/** Gives template scenes/slides fresh IDs so drafts never share identifiers. */
function instantiate(content: PlaybookContent): PlaybookContent {
  const clone = structuredClone(content);
  if (clone.kind === "ugc")
    clone.scenes = clone.scenes.map((s) => ({ ...s, id: newId("scn") }));
  else clone.slides = clone.slides.map((s) => ({ ...s, id: newId("sld") }));
  return clone;
}

/**
 * Creates a DRAFT playbook attached to one of the org's campaigns. The
 * playbook's format follows its campaign; a template of another format is
 * rejected rather than converted. Creating a draft never publishes,
 * activates or charges anything.
 */
export async function createPlaybookDraft(
  ctx: CommandContext,
  input: { campaignId: string; name?: string; templateId?: string | null },
) {
  const db = await getDb();
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(
      and(eq(campaigns.orgId, ctx.org.id), eq(campaigns.id, input.campaignId)),
    )
    .limit(1);
  if (!campaign) throw new NotFoundError("Campaign not found.");

  const template = findTemplate(input.templateId);
  if (template && template.format !== campaign.format) {
    throw new Error(
      `Template "${template.name}" is for ${template.format} campaigns; this campaign uses ${campaign.format}.`,
    );
  }
  const id = newId("pbk");
  const [row] = await db
    .insert(playbooks)
    .values({
      id,
      orgId: ctx.org.id,
      campaignId: campaign.id,
      name:
        input.name?.trim() || (template ? template.name : "Untitled playbook"),
      format: campaign.format,
      status: "draft",
      active: false,
      templateId: template?.id ?? null,
      content: template
        ? instantiate(template.content)
        : emptyContent(campaign.format),
      descriptions: template ? [...template.descriptions] : [],
      hashtags: template ? [...template.hashtags] : [],
      createdByUserId: ctx.user.id,
    })
    .returning();
  await recordAudit({
    orgId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "playbook.create_draft",
    targetType: "playbook",
    targetId: id,
  });
  return row;
}

export async function getPlaybook(orgId: string, playbookId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(playbooks)
    .where(and(eq(playbooks.orgId, orgId), eq(playbooks.id, playbookId)))
    .limit(1);
  return row ?? null;
}
