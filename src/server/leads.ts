"use server";

/**
 * Acquisition funnel (`/start`) Server Actions. One lead row per visitor
 * journey: step 1 creates it (work email + CTA attribution), step 2 fills in
 * the brand details, step 3 records the chosen route. The lead is identified
 * by an httpOnly cookie holding its unguessable ID — never by an ID sent from
 * the client — so a visitor can only update their own lead.
 *
 * Steps are enforced in order on the server; every action is rate-limited
 * per client IP (from x-forwarded-for) and lead creation also per email.
 */
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { site } from "@/config/site";
import {
  isSalesCta,
  leadDetailsSchema,
  leadEmailSchema,
  leadRouteSchema,
  normalizeCtaSource,
  routeDestination,
  startRedirectFor,
} from "@/domain/lead";
import { fail, fromZodError, ok, runAction, type ActionResult } from "./action-result";
import { getCurrentSession } from "./auth/session";
import { listUserOrganizations } from "./authz";
import { getDb } from "./db/client";
import { leads } from "./db/schema";
import { leadCookieName, readLeadCookie } from "./lead-link";
import { sendEmail, type EmailDeliveryStatus } from "./email";
import { consumeRateLimit } from "./rate-limit";

const LEAD_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const IP_LIMIT = { count: 30, windowSeconds: 60 * 60 };
const EMAIL_LIMIT = { count: 5, windowSeconds: 60 * 60 };

/** Values the funnel shows again when the same visitor returns (their own lead only). */
export interface VisitorLead {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  companyWebsite: string;
  budgetBand: string | null;
  jobLevel: string | null;
  jobFunction: string | null;
  notes: string;
  stepReached: number;
}

export type LeadNotificationStatus = EmailDeliveryStatus | "not_configured" | "already_notified";

/* ----------------------------------------------------------------------------
 * Actions
 * ------------------------------------------------------------------------- */

/** Step 1: work email. Creates the lead, or keeps the visitor's existing lead when the email is unchanged. */
export async function submitLeadEmail(input: { email: string; cta?: string | null }): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    const limited = await limitByIp();
    if (limited) return limited;
    const parsed = leadEmailSchema.safeParse({ email: input?.email ?? "" });
    if (!parsed.success) return fromZodError(parsed.error);
    const { email } = parsed.data;
    const ctaSource = normalizeCtaSource(input?.cta);

    const existing = await loadVisitorLeadRow();
    const db = await getDb();
    if (existing && existing.email === email) {
      if (!existing.ctaSource && ctaSource) {
        await db.update(leads).set({ ctaSource, updatedAt: new Date() }).where(eq(leads.id, existing.id));
      }
      return ok({ email });
    }

    const byEmail = await consumeRateLimit(`lead:email:${email}`, EMAIL_LIMIT.count, EMAIL_LIMIT.windowSeconds);
    if (!byEmail.allowed) return fail("Too many attempts with this email. Try again later.", "rate_limited");

    const id = newId("lead");
    await db.insert(leads).values({ id, email, ctaSource, stepReached: 1 });
    (await cookies()).set(leadCookieName(), id, {
      httpOnly: true,
      secure: site.appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: LEAD_COOKIE_MAX_AGE_SECONDS,
    });
    return ok({ email });
  });
}

/** Step 2: "Tell us about your brand". Requires step 1 for this visitor. */
export async function submitLeadDetails(input: Record<string, unknown>): Promise<ActionResult<{ notification: LeadNotificationStatus }>> {
  return runAction(async () => {
    const limited = await limitByIp();
    if (limited) return limited;
    const lead = await loadVisitorLeadRow();
    if (!lead) return fail("Enter your work email first.", "conflict");
    const parsed = leadDetailsSchema.safeParse(input ?? {});
    if (!parsed.success) return fromZodError(parsed.error);
    const details = parsed.data;

    const db = await getDb();
    const firstCompletion = lead.stepReached < 2;
    await db
      .update(leads)
      .set({ ...details, stepReached: Math.max(lead.stepReached, 2), updatedAt: new Date() })
      .where(eq(leads.id, lead.id));

    const notification = firstCompletion ? await notifyTeam(lead.email, lead.ctaSource, details) : "already_notified";
    return ok({ notification });
  });
}

/** Step 3: "Choose how to start". Requires step 2; returns where to go next. */
export async function chooseLeadRoute(input: { route: string }): Promise<ActionResult<{ destination: string }>> {
  return runAction(async () => {
    const limited = await limitByIp();
    if (limited) return limited;
    const lead = await loadVisitorLeadRow();
    if (!lead) return fail("Enter your work email first.", "conflict");
    if (lead.stepReached < 2) return fail("Tell us about your brand first.", "conflict");
    const parsed = leadRouteSchema.safeParse(input ?? {});
    if (!parsed.success) return fromZodError(parsed.error);
    const { route } = parsed.data;
    if (route === "book_call" && !isSalesCta(lead.ctaSource)) return fail("Booking a call is offered from Talk to Sales.", "validation");

    const destination = routeDestination(route, lead.email, site.salesBookingUrl);
    if (!destination) return fail("Call booking is not configured on this site yet. Your details are saved.", "not_configured");

    const db = await getDb();
    await db
      .update(leads)
      .set({ routeChoice: route === "book_call" ? null : route, stepReached: 3, updatedAt: new Date() })
      .where(eq(leads.id, lead.id));
    return ok({ destination });
  });
}

/** L31: where `/start` sends a signed-in viewer (Home for workspace members), or null to show the funnel. */
export async function getStartRedirect(): Promise<"/home" | "/onboarding" | null> {
  const current = await getCurrentSession();
  if (!current) return null;
  const orgs = await listUserOrganizations(current.user.id);
  return startRedirectFor({ signedIn: true, workspaceCount: orgs.length });
}

/** The current visitor's own lead (from their cookie), to resume the form. */
export async function getVisitorLead(): Promise<VisitorLead | null> {
  const row = await loadVisitorLeadRow();
  if (!row) return null;
  return {
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    companyName: row.companyName,
    companyWebsite: row.companyWebsite,
    budgetBand: row.budgetBand,
    jobLevel: row.jobLevel,
    jobFunction: row.jobFunction,
    notes: row.notes,
    stepReached: row.stepReached,
  };
}

/* ----------------------------------------------------------------------------
 * Helpers (not exported: a "use server" module exposes only actions)
 * ------------------------------------------------------------------------- */

async function loadVisitorLeadRow() {
  const id = await readLeadCookie();
  if (!id) return null;
  const db = await getDb();
  const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return row ?? null;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}

async function limitByIp(): Promise<ActionResult<never> | null> {
  const result = await consumeRateLimit(`lead:ip:${await clientIp()}`, IP_LIMIT.count, IP_LIMIT.windowSeconds);
  return result.allowed ? null : fail("Too many attempts from this network. Try again in a little while.", "rate_limited");
}

/** Emails the configured support address once per lead; reports the true delivery result. */
async function notifyTeam(
  email: string,
  ctaSource: string | null,
  details: { firstName: string; lastName: string; companyName: string; companyWebsite: string; budgetBand: string; jobLevel: string; jobFunction: string; notes: string },
): Promise<LeadNotificationStatus> {
  if (!site.supportEmail) return "not_configured";
  const body = [
    `New ${isSalesCta(ctaSource) ? "sales " : ""}lead from the website.`,
    "",
    `Name: ${details.firstName} ${details.lastName}`,
    `Email: ${email}`,
    `Company: ${details.companyName} (${details.companyWebsite})`,
    `Monthly marketing budget: ${details.budgetBand}`,
    `Role: ${details.jobLevel}, ${details.jobFunction}`,
    `Source: ${ctaSource ?? "direct"}`,
    details.notes ? `\nNotes:\n${details.notes}` : "",
  ].join("\n");
  const result = await sendEmail({
    to: site.supportEmail,
    template: "lead_received",
    subject: `New lead: ${details.companyName}`,
    body,
  });
  return result.status;
}
