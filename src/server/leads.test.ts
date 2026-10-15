import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { makeOrg, makeUser } from "../../tests/support/factories";
import { cookieJar, headerBag, resetRequestContext, signInAs } from "../../tests/support/request-context";
import { emailOutbox, leads } from "./db/schema";
import { getDb } from "./db/client";
import { chooseLeadRoute, getStartRedirect, getVisitorLead, submitLeadDetails, submitLeadEmail } from "./leads";

/** Mutable copy of the site config so tests can toggle the support address and booking URL. */
const mockSite = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("@/config/site", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/site")>();
  return { ...actual, site: Object.assign(mockSite, actual.site) };
});

const details = {
  firstName: "Sam",
  lastName: "Rivera",
  phone: "+1 555 010 0000",
  companyName: "Brand Co",
  companyWebsite: "brand.example",
  budgetBand: "$100K – $250K",
  jobLevel: "Director",
  jobFunction: "Marketing",
  notes: "",
};

async function allLeads() {
  const db = await getDb();
  return db.select().from(leads);
}

/** A new visitor: fresh cookies and a distinct IP. */
function newVisitor(ip = "203.0.113.10") {
  resetRequestContext();
  headerBag.set("x-forwarded-for", `${ip}, 10.0.0.1`);
}

beforeEach(async () => {
  await createTestDb();
  newVisitor();
  mockSite.supportEmail = null;
  mockSite.salesBookingUrl = null;
});

describe("lead funnel", () => {
  it("creates the lead at step 1 and updates the same lead across steps", async () => {
    const step1 = await submitLeadEmail({ email: "Sam@Brand.Example", cta: "pricing_unlimited" });
    expect(step1).toMatchObject({ ok: true, data: { email: "sam@brand.example" } });
    let rows = await allLeads();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "sam@brand.example", ctaSource: "pricing_unlimited", stepReached: 1 });

    const step2 = await submitLeadDetails(details);
    expect(step2).toMatchObject({ ok: true, data: { notification: "not_configured" } });
    rows = await allLeads();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyName: "Brand Co", budgetBand: "$100K – $250K", stepReached: 2 });

    const step3 = await chooseLeadRoute({ route: "self_serve" });
    expect(step3).toEqual({ ok: true, data: { destination: "/auth/sign-up?email=sam%40brand.example&next=%2Fonboarding" }, message: undefined });
    rows = await allLeads();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ routeChoice: "self_serve", stepReached: 3 });
  });

  it("keeps the same lead when step 1 is resubmitted with the same email, and starts a new one for a different email", async () => {
    await submitLeadEmail({ email: "sam@brand.example", cta: "hero_primary" });
    await submitLeadEmail({ email: "sam@brand.example", cta: "footer" });
    expect(await allLeads()).toHaveLength(1);
    expect((await allLeads())[0].ctaSource).toBe("hero_primary");

    await submitLeadEmail({ email: "other@brand.example" });
    expect(await allLeads()).toHaveLength(2);
    expect((await getVisitorLead())?.email).toBe("other@brand.example");
  });

  it("records a missing or malformed CTA as null", async () => {
    await submitLeadEmail({ email: "a@brand.example", cta: "<img src=x>" });
    expect((await allLeads())[0].ctaSource).toBeNull();
  });

  it("enforces step order", async () => {
    expect(await submitLeadDetails(details)).toMatchObject({ ok: false, code: "conflict" });
    expect(await chooseLeadRoute({ route: "learn" })).toMatchObject({ ok: false, code: "conflict" });

    await submitLeadEmail({ email: "sam@brand.example" });
    expect(await chooseLeadRoute({ route: "learn" })).toMatchObject({ ok: false, code: "conflict", error: "Tell us about your brand first." });
    expect((await allLeads())[0].stepReached).toBe(1);
  });

  it("returns field errors and does not save invalid details", async () => {
    await submitLeadEmail({ email: "sam@brand.example" });
    const result = await submitLeadDetails({ ...details, companyWebsite: "not a site", budgetBand: "$1M" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("validation");
      expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["companyWebsite", "budgetBand"]));
    }
    expect((await allLeads())[0]).toMatchObject({ companyWebsite: "", stepReached: 1 });
  });

  it("rejects an invalid email at step 1", async () => {
    expect(await submitLeadEmail({ email: "nope" })).toMatchObject({ ok: false, code: "validation" });
    expect(await allLeads()).toHaveLength(0);
  });

  it("ignores a forged lead cookie from another visitor's format", async () => {
    await submitLeadEmail({ email: "sam@brand.example" });
    newVisitor("203.0.113.11");
    cookieJar.set("lead", "lead_' or 1=1 --");
    expect(await submitLeadDetails(details)).toMatchObject({ ok: false, code: "conflict" });
  });

  it("a visitor without the cookie cannot update someone else's lead", async () => {
    await submitLeadEmail({ email: "sam@brand.example" });
    newVisitor("203.0.113.12");
    expect(await submitLeadDetails(details)).toMatchObject({ ok: false, code: "conflict" });
    expect(await getVisitorLead()).toBeNull();
  });

  it("learn routes to how it works", async () => {
    await submitLeadEmail({ email: "sam@brand.example" });
    await submitLeadDetails(details);
    expect(await chooseLeadRoute({ route: "learn" })).toMatchObject({ ok: true, data: { destination: "/how-it-works" } });
    expect((await allLeads())[0].routeChoice).toBe("learn");
  });

  it("book a call is only for sales leads and only when a booking URL is configured", async () => {
    await submitLeadEmail({ email: "sam@brand.example", cta: "hero_primary" });
    await submitLeadDetails(details);
    expect(await chooseLeadRoute({ route: "book_call" })).toMatchObject({ ok: false, code: "validation" });

    newVisitor("203.0.113.13");
    await submitLeadEmail({ email: "lee@brand.example", cta: "hero_sales" });
    await submitLeadDetails(details);
    expect(await chooseLeadRoute({ route: "book_call" })).toMatchObject({ ok: false, code: "not_configured" });

    mockSite.salesBookingUrl = "https://booking.example/sales";
    expect(await chooseLeadRoute({ route: "book_call" })).toMatchObject({ ok: true, data: { destination: "https://booking.example/sales" } });
    const lead = (await allLeads()).find((l) => l.email === "lee@brand.example");
    expect(lead).toMatchObject({ stepReached: 3, routeChoice: null, ctaSource: "hero_sales" });
  });
});

describe("team notification", () => {
  it("emails the support address once and reports the true delivery status", async () => {
    mockSite.supportEmail = "team@ourproduct.example";
    await submitLeadEmail({ email: "sam@brand.example", cta: "hero_sales" });
    const first = await submitLeadDetails(details);
    // No email provider in tests: the message is recorded but not delivered.
    expect(first).toMatchObject({ ok: true, data: { notification: "provider_unconfigured" } });
    const second = await submitLeadDetails({ ...details, notes: "Updated" });
    expect(second).toMatchObject({ ok: true, data: { notification: "already_notified" } });

    const db = await getDb();
    const outbox = await db.select().from(emailOutbox).where(eq(emailOutbox.template, "lead_received"));
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ toEmail: "team@ourproduct.example", status: "provider_unconfigured" });
  });

  it("sends nothing when no support address is configured", async () => {
    await submitLeadEmail({ email: "sam@brand.example" });
    await submitLeadDetails(details);
    const db = await getDb();
    expect(await db.select().from(emailOutbox)).toHaveLength(0);
  });
});

describe("rate limiting", () => {
  it("limits lead creation per email", async () => {
    for (let i = 0; i < 5; i++) {
      newVisitor(`198.51.100.${i}`);
      expect((await submitLeadEmail({ email: "sam@brand.example" })).ok).toBe(true);
    }
    newVisitor("198.51.100.99");
    expect(await submitLeadEmail({ email: "sam@brand.example" })).toMatchObject({ ok: false, code: "rate_limited" });
    expect(await allLeads()).toHaveLength(5);
  });

  it("limits every funnel action per client IP (first x-forwarded-for entry)", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await submitLeadEmail({ email: `p${i}@brand.example` })).ok).toBe(true);
    }
    expect(await submitLeadEmail({ email: "late@brand.example" })).toMatchObject({ ok: false, code: "rate_limited" });
    expect(await submitLeadDetails(details)).toMatchObject({ ok: false, code: "rate_limited" });

    newVisitor("192.0.2.50");
    expect((await submitLeadEmail({ email: "late@brand.example" })).ok).toBe(true);
  });
});

describe("start redirect for signed-in visitors", () => {
  it("shows the funnel to signed-out visitors", async () => {
    expect(await getStartRedirect()).toBeNull();
  });

  it("sends a workspace member (owner or member) home", async () => {
    const { owner } = await makeOrg();
    await signInAs(owner.id);
    expect(await getStartRedirect()).toBe("/home");
  });

  it("sends a signed-in user without a workspace to onboarding", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    expect(await getStartRedirect()).toBe("/onboarding");
  });
});
