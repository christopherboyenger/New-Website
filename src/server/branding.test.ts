import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeOrg } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { requireOrgAction } from "./authz";
import { getDb } from "./db/client";
import { auditLog, organizations } from "./db/schema";
import { loadBrandingPage, updateBranding } from "./branding";

function input(patch: Record<string, unknown> = {}) {
  return {
    expectedVersion: 1,
    name: "Brand Co",
    brandHashtag: "#BrandCo",
    categories: ["Sports", "Fitness", ""],
    brandColor: "#FF2800",
    descriptionHtml: "<p>Hello <b>creators</b></p>",
    websiteUrl: "brand.example",
    appStoreUrl: "",
    playStoreUrl: "",
    ...patch,
  };
}

describe("branding", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("lets owners save normalized, sanitized branding and bumps the version", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const result = await updateBranding(
      org.slug,
      input({
        descriptionHtml: '<h2>Rules</h2><p onclick="x()">Be <b>kind</b><script>alert(1)</script> <a href="javascript:alert(1)">bad</a> <a href="https://ok.example">ok</a></p>',
        appStoreUrl: "https://apps.apple.com/us/app/id123",
        playStoreUrl: "https://play.google.com/store/apps/details?id=com.example",
      }),
    );
    expect(result.ok).toBe(true);
    const db = await getDb();
    const [row] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(row).toMatchObject({
      name: "Brand Co",
      brandHashtag: "brandco",
      categories: ["Sports", "Fitness"],
      brandColor: "#ff2800",
      websiteUrl: "https://brand.example/",
      appStoreUrl: "https://apps.apple.com/us/app/id123",
      playStoreUrl: "https://play.google.com/store/apps/details?id=com.example",
      version: 2,
    });
    expect(row.descriptionHtml).toBe('<h2>Rules</h2><p>Be <strong>kind</strong> bad <a href="https://ok.example/" rel="noopener noreferrer" target="_blank">ok</a></p>');
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "branding.update"));
    expect(audit.data).toMatchObject({ fields: expect.arrayContaining(["name", "brandHashtag", "descriptionHtml"]) });
  });

  it("is owner-only and shows members a read-only page", async () => {
    const { org } = await makeOrg();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    expect(await updateBranding(org.slug, input())).toMatchObject({ ok: false, code: "forbidden" });
    const ctx = await requireOrgAction(org.slug);
    const page = loadBrandingPage(ctx);
    expect(page.canEdit).toBe(false);
    expect(page.mediaStorage.configured).toBe(false);
  });

  it("rejects a stale version instead of overwriting", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    expect(await updateBranding(org.slug, input({ name: "First" }))).toMatchObject({ ok: true });
    const stale = await updateBranding(org.slug, input({ name: "Second" }));
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    const db = await getDb();
    const [row] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(row.name).toBe("First");
  });

  it("rejects invalid URLs, hashtags, colors, categories and over-long descriptions", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const check = async (patch: Record<string, unknown>, field: string) => {
      const result = await updateBranding(org.slug, input(patch));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(Object.keys(result.fieldErrors ?? {})).toContain(field);
    };
    await check({ websiteUrl: "javascript:alert(1)" }, "websiteUrl");
    await check({ websiteUrl: "not a url" }, "websiteUrl");
    await check({ appStoreUrl: "https://evil.example/app" }, "appStoreUrl");
    await check({ playStoreUrl: "https://apps.apple.com/app" }, "playStoreUrl");
    await check({ brandHashtag: "two words" }, "brandHashtag");
    await check({ brandColor: "red" }, "brandColor");
    await check({ categories: ["Sports", "Sports", ""] }, "categories");
    await check({ categories: ["Knitting", "", ""] }, "categories.0");
    await check({ name: "  " }, "name");
    await check({ descriptionHtml: `<p>${"a".repeat(1001)}</p>` }, "descriptionHtml");
    const db = await getDb();
    const [row] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(row.version).toBe(1);
  });
});
