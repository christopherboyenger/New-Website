import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e local password 0123";

/** A unique, valid email per call so journeys never collide across runs or tests. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Checks a visually hidden radio by clicking its card label, as a person would. */
export async function chooseRadio(page: Page, name: string | RegExp): Promise<void> {
  const radio = page.getByRole("radio", { name, exact: typeof name === "string" ? true : undefined });
  await page.locator("label").filter({ has: radio }).first().click();
  await expect(radio).toBeChecked();
}

/** Brand sign-up through /auth/sign-up; lands on onboarding (or `next`). */
export async function signUpBrandUser(page: Page, opts: { email: string; firstName?: string; lastName?: string; next?: string }): Promise<void> {
  await page.goto(opts.next ? `/auth/sign-up?next=${encodeURIComponent(opts.next)}&email=${encodeURIComponent(opts.email)}` : "/auth/sign-up");
  await page.getByLabel("First name").fill(opts.firstName ?? "E2E");
  await page.getByLabel("Last name").fill(opts.lastName ?? "Tester");
  await page.getByLabel("Email").fill(opts.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Workspace slug from a /home/<slug>/… URL. */
export function slugFromUrl(url: string): string {
  const match = /\/home\/([^/?#]+)/.exec(new URL(url).pathname);
  if (!match) throw new Error(`Not a workspace URL: ${url}`);
  return match[1];
}

/**
 * Creates a brand owner and workspace through the real UI (sign-up and every
 * onboarding screen, deferring payment) and returns the workspace slug.
 * Journeys that are not about onboarding use it as their setup.
 */
export async function createBrandWorkspace(page: Page, opts: { email: string; brandName: string; format?: "UGC" | "Slideshow" }): Promise<string> {
  await signUpBrandUser(page, { email: opts.email, firstName: "Owner" });
  await expect(page).toHaveURL(/\/onboarding$/);
  const next = page.getByRole("button", { name: "Next", exact: true });
  const heading = (name: string | RegExp) => expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await heading("What best describes your role?");
  await chooseRadio(page, "Operations");
  await next.click();
  await page.getByRole("button", { name: "Get Started" }).click();
  await heading(/Where did you hear about/);
  await chooseRadio(page, "Google Search");
  await next.click();
  await heading("Tell us about your brand");
  await page.getByLabel("Brand Name").fill(opts.brandName);
  await page.getByLabel("Your website").fill("example.test");
  await page.getByLabel("Brand Description").fill("Workspace created by the end-to-end suite.");
  await next.click();
  await heading("Set your daily budget");
  await next.click();
  await heading("Here’s your plan so far");
  await next.click();
  await heading("Choose a content format");
  await chooseRadio(page, new RegExp(`^${opts.format ?? "UGC"}`));
  await next.click();
  await heading("Start from a template");
  await page.locator("label").filter({ has: page.getByRole("radio") }).first().click();
  await next.click();
  await heading("How often do you want to be charged?");
  await next.click();
  await heading("You’re almost there");
  await page.getByRole("button", { name: "I’ll finish later" }).click();
  await page.waitForURL(/\/home\/[^/]+\/playbooks\/[^/]+\/edit/);
  return slugFromUrl(page.url());
}

/**
 * Verifies `email` the way a local developer does: no email provider is
 * configured, so the verification message is only recorded; its link is read
 * from the development outbox (/dev/outbox) and confirmed explicitly.
 */
export async function verifyEmailViaOutbox(page: Page, email: string): Promise<void> {
  await page.goto("/dev/outbox");
  const message = page.getByRole("listitem").filter({ hasText: email }).filter({ hasText: /^Verify your email/ }).first();
  await expect(message).toContainText("provider_unconfigured");
  const body = (await message.locator("pre").textContent()) ?? "";
  const link = /https?:\/\/\S+\/auth\/verify\?token=\S+/.exec(body)?.[0];
  expect(link, `verification link for ${email} in the outbox`).toBeTruthy();
  const url = new URL(link!);
  await page.goto(url.pathname + url.search);
  await page.getByRole("button", { name: "Verify email address" }).click();
  await expect(page.getByText("Your email address is verified.")).toBeVisible();
}
