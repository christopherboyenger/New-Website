/**
 * Test-only builders for creator-portal tests (imported by *.test.ts files only).
 */
import { newId } from "@/lib/ids";
import type { Platform } from "@/domain/campaign";
import type { PlaybookContent } from "@/domain/playbook-content";
import { getDb } from "../db/client";
import { playbookRevisions, socialAccounts } from "../db/schema";
import { makeCampaign, makeCreator, makePlaybook, makeUser } from "../../../tests/support/factories";

export const ugcContent: PlaybookContent = {
  kind: "ugc",
  generalInstructions: "Published instructions.",
  references: [],
  scenes: [{ id: "scn_1", name: "Hook", instructions: "Open with the hook.", textOptions: ["Published A", "Published B"] }],
};

/** A creator profile linked to a fresh user. */
export async function makeCreatorUser(overrides: Parameters<typeof makeCreator>[0] = {}) {
  const user = await makeUser();
  const creator = await makeCreator({ userId: user.id, country: "US", ...overrides });
  return { user, creator };
}

export async function linkAccount(creatorId: string, platform: Platform, handle: string, opts: { dedicated?: boolean; verified?: boolean } = {}) {
  const db = await getDb();
  const [row] = await db
    .insert(socialAccounts)
    .values({
      id: newId("acc"),
      creatorId,
      platform,
      handle,
      dedicated: opts.dedicated ?? false,
      verification: opts.verified ? "verified" : "unverified",
      verifiedAt: opts.verified ? new Date() : null,
    })
    .returning();
  return row;
}

/** A published + active playbook (revision 1 frozen) whose working draft differs from the published content. */
export async function publishPlaybook(orgId: string, campaignId: string, opts: { active?: boolean } = {}) {
  const db = await getDb();
  const draft: PlaybookContent = { ...ugcContent, generalInstructions: "DRAFT ONLY instructions." };
  const playbook = await makePlaybook(orgId, campaignId, {
    status: "published",
    active: opts.active ?? true,
    publishedRevision: 1,
    publishedAt: new Date(),
    content: draft,
    descriptions: ["Draft description"],
    hashtags: ["draftonly"],
  });
  await db.insert(playbookRevisions).values({
    id: newId("rev"),
    playbookId: playbook.id,
    orgId,
    revision: 1,
    name: "Published name",
    content: ugcContent,
    descriptions: ["Published description"],
    hashtags: ["summer"],
  });
  return playbook;
}

/** An active campaign with one distributed playbook. */
export async function activeCampaign(orgId: string, overrides: Parameters<typeof makeCampaign>[1] = {}) {
  const campaign = await makeCampaign(orgId, { status: "active", activatedAt: new Date(), ...overrides });
  const playbook = await publishPlaybook(orgId, campaign.id);
  return { campaign, playbook };
}
