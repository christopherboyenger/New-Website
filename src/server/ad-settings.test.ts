import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { addMember, makeOrg } from "../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../tests/support/request-context";
import { loadAdSettings, saveAdSettings, type AdDefaults } from "./ad-settings";
import { getDb } from "./db/client";
import { adSettings, auditLog } from "./db/schema";

const valid = (overrides: Partial<AdDefaults> = {}): AdDefaults => ({
  copyTemplates: ["Made by {{creator}} for {{brand}}"],
  naming: { fields: [{ kind: "custom", value: "Brand" }, { kind: "creator" }], separator: "_" },
  links: { websiteUrl: "https://example.com", params: [{ key: "utm_source", value: "{{platform}}" }] },
  defaultCta: { meta: "LEARN_MORE", tiktok: "SHOP_NOW" },
  ...overrides,
});

describe("ad settings", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("loads product defaults at version 0 when nothing was saved", async () => {
    const { org, owner } = await makeOrg({ slug: "brand-a" });
    await signInAs(owner.id);
    const r = await loadAdSettings(org.slug);
    expect(r.ok && r.data.version).toBe(0);
    expect(r.ok && r.data.canEdit).toBe(true);
    expect(r.ok && r.data.settings.copyTemplates).toEqual([]);
  });

  it("lets an owner save, bumping the version, and records an audit entry", async () => {
    const { org, owner } = await makeOrg({ slug: "brand-a" });
    await signInAs(owner.id);
    const first = await saveAdSettings(org.slug, 0, valid());
    expect(first).toMatchObject({ ok: true, data: { version: 1 } });
    const second = await saveAdSettings(org.slug, 1, valid({ copyTemplates: [] }));
    expect(second).toMatchObject({ ok: true, data: { version: 2 } });
    const db = await getDb();
    const [row] = await db.select().from(adSettings).where(eq(adSettings.orgId, org.id));
    expect(row.copyTemplates).toEqual([]);
    expect(row.defaultCta).toEqual({ meta: "LEARN_MORE", tiktok: "SHOP_NOW" });
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "ad_settings.update"));
    expect(audits).toHaveLength(2);
  });

  it("forbids members from saving but lets them read", async () => {
    const { org } = await makeOrg({ slug: "brand-a" });
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    const r = await saveAdSettings(org.slug, 0, valid());
    expect(r).toMatchObject({ ok: false, code: "forbidden" });
    const loaded = await loadAdSettings(org.slug);
    expect(loaded.ok && loaded.data.canEdit).toBe(false);
    const db = await getDb();
    expect(await db.select().from(adSettings)).toHaveLength(0);
  });

  it("rejects a stale version without writing", async () => {
    const { org, owner } = await makeOrg({ slug: "brand-a" });
    await signInAs(owner.id);
    await saveAdSettings(org.slug, 0, valid());
    const stale = await saveAdSettings(org.slug, 0, valid({ copyTemplates: ["other"] }));
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    const staleUpdate = await saveAdSettings(org.slug, 5, valid({ copyTemplates: ["other"] }));
    expect(staleUpdate).toMatchObject({ ok: false, code: "conflict" });
    const db = await getDb();
    const [row] = await db.select().from(adSettings).where(eq(adSettings.orgId, org.id));
    expect(row.copyTemplates).toEqual(["Made by {{creator}} for {{brand}}"]);
    expect(row.version).toBe(1);
  });

  it("validates every tab and returns field errors", async () => {
    const { org, owner } = await makeOrg({ slug: "brand-a" });
    await signInAs(owner.id);
    const r = await saveAdSettings(
      org.slug,
      0,
      valid({
        links: { websiteUrl: "http://example.com", params: [] },
        defaultCta: { meta: "NOT_A_CTA", tiktok: null },
        copyTemplates: ["{{price}}"],
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("validation");
    expect(Object.keys(r.fieldErrors ?? {})).toEqual(expect.arrayContaining(["links.websiteUrl", "defaultCta.meta", "copyTemplates.0"]));
  });

  it("treats another organization as not found", async () => {
    const { org: other } = await makeOrg({ slug: "brand-b" });
    const { owner } = await makeOrg({ slug: "brand-a" });
    await signInAs(owner.id);
    expect(await saveAdSettings(other.slug, 0, valid())).toMatchObject({ ok: false, code: "not_found" });
    expect(await loadAdSettings(other.slug)).toMatchObject({ ok: false, code: "not_found" });
  });
});
