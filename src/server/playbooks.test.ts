import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeCampaign, makeOrg, makePlaybook } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import type { UgcContent } from "@/domain/playbook-content";
import type { DraftPayload } from "@/domain/playbook-validation";
import { getDb } from "./db/client";
import { auditLog, billingAccounts, campaigns, playbookRevisions, playbooks } from "./db/schema";
import { loadLatestDraft, loadPlaybookEditor, publishPlaybook, saveDraft } from "./playbooks";

const content: UgcContent = {
  kind: "ugc",
  generalInstructions: "Natural light.",
  references: [
    {
      id: "ref_1",
      assetId: null,
      url: "https://example.com/reference",
      title: "Pacing reference",
    },
  ],
  scenes: [
    {
      id: "scn_a",
      name: "Background",
      instructions: "Record your screen.",
      textOptions: ["Line one"],
    },
    {
      id: "scn_b",
      name: "Greenscreen",
      instructions: "Film the take.",
      textOptions: [],
    },
  ],
};

const payload = (overrides: Partial<DraftPayload> = {}): DraftPayload => ({
  name: "Launch script",
  templateId: null,
  content,
  descriptions: ["First option", "Second option"],
  hashtags: ["fyp"],
  ...overrides,
});

async function setup() {
  const { org, owner } = await makeOrg({ slug: "brand-a" });
  const campaign = await makeCampaign(org.id, { primaryHashtag: "brandatag" });
  const playbook = await makePlaybook(org.id, campaign.id);
  return { org, owner, campaign, playbook };
}

async function setPaymentReady(orgId: string) {
  const db = await getDb();
  await db.insert(billingAccounts).values({
    orgId,
    paymentMethodStatus: "ready",
    paymentMethodBrand: "visa",
    paymentMethodLast4: "4242",
  });
}

async function readPlaybook(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(playbooks).where(eq(playbooks.id, id));
  return row;
}

beforeEach(async () => {
  await createTestDb();
  resetRequestContext();
});

describe("loadPlaybookEditor", () => {
  it("loads the playbook, its campaign and the viewer's permissions", async () => {
    const { owner, playbook, campaign } = await setup();
    await signInAs(owner.id);
    const result = await loadPlaybookEditor("brand-a", playbook.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.campaign).toMatchObject({
      id: campaign.id,
      primaryHashtag: "brandatag",
    });
    expect(result.data.canPublish).toBe(true);
    expect(result.data.payment).toMatchObject({ required: true, ready: false });
    expect(result.data.mediaStorage.configured).toBe(false);
  });

  it("gives members edit but not publish, and hides payment details", async () => {
    const { org, playbook } = await setup();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    const result = await loadPlaybookEditor("brand-a", playbook.id);
    expect(result.ok && result.data.canEdit && !result.data.canPublish && result.data.payment === null).toBe(true);
  });

  it("treats another org's playbook as not found", async () => {
    const { playbook } = await setup();
    const { owner: outsider } = await makeOrg({ slug: "brand-b" });
    await signInAs(outsider.id);
    expect(await loadPlaybookEditor("brand-b", playbook.id)).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(await loadPlaybookEditor("brand-a", playbook.id)).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });
});

describe("saveDraft", () => {
  it("lets a member save the draft and bumps the version without publishing", async () => {
    const { org, playbook } = await setup();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    const result = await saveDraft("brand-a", playbook.id, playbook.version, payload());
    expect(result).toMatchObject({
      ok: true,
      data: {
        version: playbook.version + 1,
        name: "Launch script",
        hasUnpublishedChanges: false,
      },
    });
    const row = await readPlaybook(playbook.id);
    expect(row.content).toEqual(content);
    expect(row.descriptions).toEqual(["First option", "Second option"]);
    expect(row.status).toBe("draft");
    expect(row.active).toBe(false);
  });

  it("returns a conflict for a stale version and writes nothing", async () => {
    const { owner, playbook } = await setup();
    await signInAs(owner.id);
    expect((await saveDraft("brand-a", playbook.id, playbook.version, payload())).ok).toBe(true);
    const stale = await saveDraft("brand-a", playbook.id, playbook.version, payload({ name: "Other tab" }));
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    expect((await readPlaybook(playbook.id)).name).toBe("Launch script");

    const latest = await loadLatestDraft("brand-a", playbook.id);
    expect(latest).toMatchObject({
      ok: true,
      data: { version: playbook.version + 1, name: "Launch script" },
    });
  });

  it("does not reveal or modify another org's playbook", async () => {
    const { playbook } = await setup();
    const { owner: outsider } = await makeOrg({ slug: "brand-b" });
    await signInAs(outsider.id);
    expect(await saveDraft("brand-b", playbook.id, playbook.version, payload())).toMatchObject({ ok: false, code: "not_found" });
    expect(await saveDraft("brand-a", playbook.id, playbook.version, payload())).toMatchObject({ ok: false, code: "not_found" });
    expect((await readPlaybook(playbook.id)).version).toBe(playbook.version);
  });

  it("validates the payload for the playbook's format", async () => {
    const { owner, playbook } = await setup();
    await signInAs(owner.id);
    const wrongFormat = await saveDraft(
      "brand-a",
      playbook.id,
      playbook.version,
      payload({
        content: { kind: "slideshow", generalInstructions: "", slides: [] },
      }),
    );
    expect(wrongFormat).toMatchObject({ ok: false, code: "validation" });
    const primaryTag = await saveDraft("brand-a", playbook.id, playbook.version, payload({ hashtags: ["brandatag"] }));
    expect(primaryTag).toMatchObject({
      ok: false,
      code: "validation",
      fieldErrors: { hashtags: expect.stringContaining("added automatically") },
    });
    const badLink = await saveDraft(
      "brand-a",
      playbook.id,
      playbook.version,
      payload({
        content: {
          ...content,
          references: [
            {
              id: "r",
              assetId: null,
              url: "http://insecure.example",
              title: "",
            },
          ],
        },
      }),
    );
    expect(badLink.ok).toBe(false);
    expect((await readPlaybook(playbook.id)).version).toBe(playbook.version);
  });

  it("stores a blank name as Untitled playbook", async () => {
    const { owner, playbook } = await setup();
    await signInAs(owner.id);
    expect(await saveDraft("brand-a", playbook.id, playbook.version, payload({ name: "   " }))).toMatchObject({
      ok: true,
      data: { name: "Untitled playbook" },
    });
  });
});

describe("publishPlaybook", () => {
  async function savedPlaybook() {
    const ctx = await setup();
    await signInAs(ctx.owner.id);
    const saved = await saveDraft("brand-a", ctx.playbook.id, ctx.playbook.version, payload());
    if (!saved.ok) throw new Error(saved.error);
    return { ...ctx, version: saved.data.version };
  }

  it("forbids members", async () => {
    const { org, playbook, version } = await savedPlaybook();
    await setPaymentReady(org.id);
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    expect(
      await publishPlaybook("brand-a", playbook.id, version, {
        makeActive: true,
      }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect((await readPlaybook(playbook.id)).status).toBe("draft");
  });

  it("is blocked until a payment method is ready", async () => {
    const { playbook, version } = await savedPlaybook();
    const result = await publishPlaybook("brand-a", playbook.id, version, {
      makeActive: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/payment/i);
    expect((await readPlaybook(playbook.id)).status).toBe("draft");
  });

  it("validates content before publishing", async () => {
    const { org, owner, campaign } = await setup();
    await setPaymentReady(org.id);
    const empty = await makePlaybook(org.id, campaign.id);
    await signInAs(owner.id);
    const result = await publishPlaybook("brand-a", empty.id, empty.version, {
      makeActive: false,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "validation",
      fieldErrors: {
        scenes: expect.any(String),
        descriptions: expect.any(String),
      },
    });
  });

  it("freezes a revision, records audit, and never activates the campaign", async () => {
    const { org, owner, playbook, campaign, version } = await savedPlaybook();
    await setPaymentReady(org.id);
    const result = await publishPlaybook("brand-a", playbook.id, version, {
      makeActive: true,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { revision: 1, active: true },
    });

    const row = await readPlaybook(playbook.id);
    expect(row).toMatchObject({
      status: "published",
      publishedRevision: 1,
      active: true,
    });
    expect(row.publishedAt).toBeInstanceOf(Date);

    const db = await getDb();
    const [campaignRow] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    expect(campaignRow.status).toBe("inactive");
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "playbook.publish"));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      orgId: org.id,
      actorUserId: owner.id,
      targetId: playbook.id,
      data: { revision: 1, active: true },
    });

    // Later draft edits never rewrite the frozen revision.
    const edited = await saveDraft("brand-a", playbook.id, version, payload({ descriptions: ["Changed"] }));
    expect(edited).toMatchObject({
      ok: true,
      data: { hasUnpublishedChanges: true },
    });
    const [revision] = await db.select().from(playbookRevisions).where(eq(playbookRevisions.playbookId, playbook.id));
    expect(revision.descriptions).toEqual(["First option", "Second option"]);
    expect(revision.content).toEqual(content);
    expect(revision.publishedByUserId).toBe(owner.id);

    // Republishing creates revision 2; leaving the box unticked makes it unavailable to creators.
    if (!edited.ok) return;
    const second = await publishPlaybook("brand-a", playbook.id, edited.data.version, { makeActive: false });
    expect(second).toMatchObject({
      ok: true,
      data: { revision: 2, active: false },
    });
    expect(await db.select().from(playbookRevisions).where(eq(playbookRevisions.playbookId, playbook.id))).toHaveLength(2);
  });

  it("rejects publishing a version the owner has not seen", async () => {
    const { org, playbook, version } = await savedPlaybook();
    await setPaymentReady(org.id);
    expect(
      await publishPlaybook("brand-a", playbook.id, version - 1, {
        makeActive: false,
      }),
    ).toMatchObject({ ok: false, code: "conflict" });
  });

  it("does not publish another org's playbook", async () => {
    const { playbook, version } = await savedPlaybook();
    const { org: other, owner: outsider } = await makeOrg({ slug: "brand-b" });
    await setPaymentReady(other.id);
    await signInAs(outsider.id);
    expect(
      await publishPlaybook("brand-b", playbook.id, version, {
        makeActive: false,
      }),
    ).toMatchObject({ ok: false, code: "not_found" });
  });
});
