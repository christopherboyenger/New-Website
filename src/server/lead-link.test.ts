import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../tests/support/db";
import { cookieJar, headerBag, resetRequestContext } from "../../tests/support/request-context";
import { makeUser } from "../../tests/support/factories";
import { signUpAction } from "./auth/actions";
import { getDb } from "./db/client";
import { leads, users } from "./db/schema";
import { leadCookieName, linkVisitorLeadToUser } from "./lead-link";
import { submitLeadEmail } from "./leads";

function signUpForm(email: string): FormData {
  const data = new FormData();
  data.set("email", email);
  data.set("password", "a long enough password");
  data.set("firstName", "Sam");
  data.set("lastName", "Rivera");
  return data;
}

/** Runs sign-up (which redirects on success) and returns once the redirect is thrown. */
async function signUpVia(email: string) {
  try {
    await signUpAction(null, signUpForm(email));
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return;
    throw error;
  }
  throw new Error("expected sign-up to redirect");
}

async function leadRows() {
  const db = await getDb();
  return db.select({ id: leads.id, email: leads.email, userId: leads.userId }).from(leads);
}

async function userIdFor(email: string) {
  const db = await getDb();
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return row.id;
}

beforeEach(async () => {
  await createTestDb();
  resetRequestContext();
  headerBag.set("x-forwarded-for", "203.0.113.20");
});

describe("linking the /start lead to the new account", () => {
  it("links the visitor's lead when the sign-up email matches (case-insensitive)", async () => {
    expect((await submitLeadEmail({ email: "Sam@Brand.Example" })).ok).toBe(true);
    await signUpVia("sam@brand.example");
    const [lead] = await leadRows();
    expect(lead.userId).toBe(await userIdFor("sam@brand.example"));
  });

  it("does not link when the sign-up email differs from the lead's email", async () => {
    await submitLeadEmail({ email: "sam@brand.example" });
    await signUpVia("someone.else@brand.example");
    const [lead] = await leadRows();
    expect(lead.userId).toBeNull();
  });

  it("signs up normally without a lead cookie", async () => {
    await signUpVia("nolead@brand.example");
    expect(await leadRows()).toEqual([]);
    expect(await userIdFor("nolead@brand.example")).toMatch(/^usr_/);
  });

  it("never re-links a lead that already belongs to an account", async () => {
    await submitLeadEmail({ email: "sam@brand.example" });
    const first = await makeUser({ email: "sam@brand.example" });
    expect(await linkVisitorLeadToUser(first.id, "sam@brand.example")).toBe(true);
    const second = await makeUser({ email: "sam2@brand.example" });
    expect(await linkVisitorLeadToUser(second.id, "sam@brand.example")).toBe(false);
    const [lead] = await leadRows();
    expect(lead.userId).toBe(first.id);
  });

  it("ignores a malformed lead cookie", async () => {
    const user = await makeUser({ email: "sam@brand.example" });
    cookieJar.set(leadCookieName(), "lead_' or 1=1 --");
    expect(await linkVisitorLeadToUser(user.id, "sam@brand.example")).toBe(false);
  });
});
