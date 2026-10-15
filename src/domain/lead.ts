/**
 * Acquisition funnel (`/start`) vocabulary and validation. Pure: shared by the
 * client form (field limits, option lists) and the server actions in
 * src/server/leads.ts (authoritative validation).
 *
 * Evidence: A02 ("STEP 2 OF 3 · Tell us about your brand") and A03 ("Choose
 * how to start"). Step 1 was never observed; the work-email step is a
 * recorded substitution (docs/decisions/marketing.md MARKETING-01).
 */
import { z } from "zod";

/** Exact categorical bands as displayed in A02 (en dash, spaces). Never parsed into numbers. */
export const BUDGET_BANDS = ["$0 – $50K", "$50K – $100K", "$100K – $250K", "$250K+"] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number];

/** Option lists are proposed (A02 showed only the placeholders) — MARKETING-03. */
export const JOB_LEVELS = ["Founder or owner", "C-level or VP", "Director", "Manager", "Individual contributor", "Other"] as const;
export const JOB_FUNCTIONS = [
  "Marketing",
  "Growth or performance",
  "Brand or creative",
  "Social or community",
  "Product",
  "Sales or partnerships",
  "Operations",
  "Other",
] as const;

/** CTA sources linked from the public site (build spec "Public website"). Unknown but well-formed values are kept for attribution. */
export const KNOWN_CTA_SOURCES = [
  "hero_primary",
  "hero_sales",
  "pricing_standard",
  "pricing_unlimited",
  "scale",
  "closing",
  "footer",
  "nav",
] as const;

export const FIELD_LIMITS = {
  email: 254,
  name: 60,
  phone: 32,
  companyName: 100,
  companyWebsite: 300,
  notes: 2000,
} as const;

/** `?cta=` value to store, or null when absent/malformed. */
export function normalizeCtaSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return /^[a-z0-9_]{1,40}$/.test(v) ? v : null;
}

/** "Talk to Sales" visitors get a sales-oriented step 3 (MARKETING-05). */
export function isSalesCta(cta: string | null | undefined): boolean {
  return cta === "hero_sales";
}

export function isWebsite(value: string): boolean {
  if (/\s/.test(value)) return false;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    const host = url.hostname;
    return (url.protocol === "https:" || url.protocol === "http:") && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host);
  } catch {
    return false;
  }
}

/** Phone numbers: digits with optional leading +, spaces, dots, dashes and parentheses; 7–15 digits (E.164 length). */
export function isPhoneNumber(value: string): boolean {
  if (!/^\+?[0-9\s().-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

export const leadEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your work email.")
    .max(FIELD_LIMITS.email, "That email address is too long.")
    .pipe(z.email("Enter a valid email address, e.g. name@yourbrand.com.")),
});

const requiredText = (max: number, missing: string) =>
  z.string().trim().min(1, missing).max(max, `Use ${max} characters or fewer.`);

export const leadDetailsSchema = z.object({
  firstName: requiredText(FIELD_LIMITS.name, "Enter your first name."),
  lastName: requiredText(FIELD_LIMITS.name, "Enter your last name."),
  phone: z
    .string()
    .trim()
    .min(1, "Enter your phone number.")
    .max(FIELD_LIMITS.phone, "That phone number is too long.")
    .refine(isPhoneNumber, "Enter a phone number with 7 to 15 digits, e.g. +1 555 010 0000."),
  companyName: requiredText(FIELD_LIMITS.companyName, "Enter your company name."),
  companyWebsite: z
    .string()
    .trim()
    .min(1, "Enter your company website.")
    .max(FIELD_LIMITS.companyWebsite, "That address is too long.")
    .refine(isWebsite, "Enter a website such as yourbrand.com."),
  budgetBand: z.enum(BUDGET_BANDS, { error: "Choose a monthly marketing budget." }),
  jobLevel: z.enum(JOB_LEVELS, { error: "Choose a job level." }),
  jobFunction: z.enum(JOB_FUNCTIONS, { error: "Choose a job function." }),
  notes: z.string().trim().max(FIELD_LIMITS.notes, `Keep this under ${FIELD_LIMITS.notes} characters.`).default(""),
});
export type LeadDetails = z.output<typeof leadDetailsSchema>;

/** Step 3 destinations. `book_call` exists only when a sales booking URL is configured. */
export const LEAD_ROUTES = ["self_serve", "learn", "book_call"] as const;
export type LeadRoute = (typeof LEAD_ROUTES)[number];
export const leadRouteSchema = z.object({ route: z.enum(LEAD_ROUTES, { error: "Choose how to start." }) });

/** Where a step-3 choice leads. Self-serve carries the lead's email into sign-up and continues to onboarding. */
export function routeDestination(route: LeadRoute, email: string, salesBookingUrl: string | null): string | null {
  switch (route) {
    case "self_serve":
      return `/auth/sign-up?${new URLSearchParams({ email, next: "/onboarding" }).toString()}`;
    case "learn":
      return "/how-it-works";
    case "book_call":
      return salesBookingUrl && /^https:\/\//i.test(salesBookingUrl) ? salesBookingUrl : null;
  }
}

/**
 * `/start` for a visitor who is already signed in (L31): members of a
 * workspace go to Home; signed-in users without one continue onboarding;
 * signed-out visitors see the funnel (null).
 */
export function startRedirectFor(viewer: { signedIn: boolean; workspaceCount: number }): "/home" | "/onboarding" | null {
  if (!viewer.signedIn) return null;
  return viewer.workspaceCount > 0 ? "/home" : "/onboarding";
}
