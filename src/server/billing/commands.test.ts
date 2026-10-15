import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/support/db";
import { addMember, makeOrg } from "../../../tests/support/factories";
import { resetRequestContext, signInAs } from "../../../tests/support/request-context";
import { getDb } from "../db/client";
import { auditLog, billingAccounts, organizations } from "../db/schema";
import { businessInformationOf, businessRevision, updateBillingThreshold, updateBusinessInformation } from "./commands";

const emptyRevision = businessRevision(businessInformationOf(null));

function businessInput(patch: Record<string, string> = {}) {
  return { revision: emptyRevision, businessName: "Brand Co LLC", line1: "1 Main St", line2: "", city: "Austin", region: "TX", postalCode: "78701", country: "United States", taxId: "12-3456789", ...patch };
}

describe("billing threshold", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("lets an owner change the threshold, bumps the version and audits", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const result = await updateBillingThreshold(org.slug, { thresholdCents: 1000, expectedVersion: 1 });
    expect(result).toMatchObject({ ok: true, data: { thresholdCents: 1000, version: 2 } });
    const db = await getDb();
    const [row] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(row).toMatchObject({ billingThresholdCents: 1000, version: 2 });
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "billing.threshold.update"));
    expect(audits[0].data).toEqual({ from: 5000, to: 1000 });
  });

  it("is owner-only", async () => {
    const { org } = await makeOrg();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    const result = await updateBillingThreshold(org.slug, { thresholdCents: 1000, expectedVersion: 1 });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("hides other workspaces as not found", async () => {
    const { org: other } = await makeOrg();
    const { owner } = await makeOrg();
    await signInAs(owner.id);
    const result = await updateBillingThreshold(other.slug, { thresholdCents: 1000, expectedVersion: 1 });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });

  it("rejects a stale version as a conflict without changing the threshold", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    await updateBillingThreshold(org.slug, { thresholdCents: 2500, expectedVersion: 1 });
    const stale = await updateBillingThreshold(org.slug, { thresholdCents: 1000, expectedVersion: 1 });
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    const db = await getDb();
    const [row] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(row.billingThresholdCents).toBe(2500);
  });

  it("rejects thresholds that the commercial policy does not offer", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    for (const thresholdCents of [1500, 0, -1000, 10.5]) {
      const result = await updateBillingThreshold(org.slug, { thresholdCents, expectedVersion: 1 });
      expect(result).toMatchObject({ ok: false, code: "validation" });
    }
    const asString = await updateBillingThreshold(org.slug, { thresholdCents: "1000", expectedVersion: 1 });
    expect(asString).toMatchObject({ ok: false, code: "validation" });
  });
});

describe("business information", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("saves trimmed details for an owner and returns the new revision", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const result = await updateBusinessInformation(org.slug, businessInput({ businessName: "  Brand Co LLC  " }));
    expect(result.ok).toBe(true);
    const db = await getDb();
    const [row] = await db.select().from(billingAccounts).where(eq(billingAccounts.orgId, org.id));
    expect(row).toMatchObject({ businessName: "Brand Co LLC", taxId: "12-3456789" });
    expect(row.businessAddress).toEqual({ line1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "United States" });
    expect(result.ok && result.data.revision).toBe(businessRevision(businessInformationOf(row)));
  });

  it("detects concurrent edits through the revision", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    await updateBusinessInformation(org.slug, businessInput());
    const stale = await updateBusinessInformation(org.slug, businessInput({ businessName: "Other" }));
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
  });

  it("validates required and dependent fields", async () => {
    const { org, owner } = await makeOrg();
    await signInAs(owner.id);
    const noName = await updateBusinessInformation(org.slug, businessInput({ businessName: " " }));
    expect(noName).toMatchObject({ ok: false, fieldErrors: { businessName: "Enter the business name." } });
    const noCountry = await updateBusinessInformation(org.slug, businessInput({ country: "" }));
    expect(noCountry).toMatchObject({ ok: false, fieldErrors: { country: "Enter the country for this address." } });
    const badTax = await updateBusinessInformation(org.slug, businessInput({ taxId: "<script>" }));
    expect(badTax).toMatchObject({ ok: false, code: "validation" });
  });

  it("is owner-only", async () => {
    const { org } = await makeOrg();
    const member = await addMember(org.id, "member");
    await signInAs(member.id);
    const result = await updateBusinessInformation(org.slug, businessInput());
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });
});
