import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/support/db";
import { makeOrg, makeUser } from "../../tests/support/factories";
import { createOrganization } from "./organizations";
import { createCampaign, HashtagTakenError } from "./campaigns-core";
import { createPlaybookDraft } from "./playbooks-core";
import { EntitlementError } from "@/domain/entitlements";
import { defaultApprovals, defaultTargeting } from "@/domain/campaign";

const campaignInput = {
  name: "Launch",
  primaryHashtag: "#MyBrandLaunch",
  format: "ugc" as const,
  dailyBudgetCents: 500_00,
};

describe("core commands", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it("creates an empty workspace with a unique slug and the creator as primary owner", async () => {
    const user = await makeUser();
    const a = await createOrganization(user.id, { name: "Pip's Pops", website: "pipspops.com", description: "Soda" });
    const b = await createOrganization(user.id, { name: "Pip's Pops", website: "", description: "" });
    expect(a.slug).toBe("pip-s-pops");
    expect(b.slug).toBe("pip-s-pops-2");
    expect(a.websiteUrl).toBe("https://pipspops.com");
    expect(a.primaryOwnerUserId).toBe(user.id);
  });

  it("creates campaigns inactive, normalizes the hashtag, and keeps hashtags unique across workspaces", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await createCampaign({ org, user: owner }, campaignInput);
    expect(campaign.status).toBe("inactive");
    expect(campaign.primaryHashtag).toBe("mybrandlaunch");
    const other = await makeOrg();
    await expect(createCampaign({ org: other.org, user: other.owner }, { ...campaignInput, primaryHashtag: "mybrandlaunch" })).rejects.toBeInstanceOf(HashtagTakenError);
  });

  it("rejects Unlimited-only settings on the basic plan server-side", async () => {
    const { org, owner } = await makeOrg({ planId: "basic" });
    await expect(
      createCampaign({ org, user: owner }, { ...campaignInput, primaryHashtag: "gated1", pricingMode: "manual", targeting: defaultTargeting, approvals: defaultApprovals }),
    ).rejects.toBeInstanceOf(EntitlementError);
    const unlimited = await makeOrg({ planId: "unlimited" });
    const ok = await createCampaign({ org: unlimited.org, user: unlimited.owner }, { ...campaignInput, primaryHashtag: "gated2", pricingMode: "manual" });
    expect(ok.pricingMode).toBe("manual");
  });

  it("enforces the $50 daily minimum", async () => {
    const { org, owner } = await makeOrg();
    await expect(createCampaign({ org, user: owner }, { ...campaignInput, dailyBudgetCents: 49_99 })).rejects.toThrow();
  });

  it("creates playbook drafts from format-compatible templates only, scoped to the org", async () => {
    const { org, owner } = await makeOrg();
    const campaign = await createCampaign({ org, user: owner }, campaignInput);
    const draft = await createPlaybookDraft({ org, user: owner }, { campaignId: campaign.id, templateId: "ugc-greenscreen" });
    expect(draft.status).toBe("draft");
    expect(draft.active).toBe(false);
    expect(draft.content.kind).toBe("ugc");
    await expect(createPlaybookDraft({ org, user: owner }, { campaignId: campaign.id, templateId: "slideshow-listicle" })).rejects.toThrow(/slideshow/);
    const other = await makeOrg();
    await expect(createPlaybookDraft({ org: other.org, user: other.owner }, { campaignId: campaign.id })).rejects.toThrow(/not found/i);
  });
});
