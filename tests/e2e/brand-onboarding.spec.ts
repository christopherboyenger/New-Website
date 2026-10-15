import { expect, test } from "@playwright/test";
import { chooseRadio, signUpBrandUser, slugFromUrl, uniqueEmail } from "./support/helpers";

test("brand signs up, completes onboarding later, edits the draft playbook and sees the inactive campaign", async ({ page }) => {
  await signUpBrandUser(page, { email: uniqueEmail("brand") });
  await expect(page).toHaveURL(/\/onboarding$/);

  // 1 · Role
  await expect(page.getByRole("heading", { level: 1, name: "What best describes your role?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await chooseRadio(page, "Founder");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 2 · Overview
  await page.getByRole("button", { name: "Get Started" }).click();

  // 3 · Referral
  await expect(page.getByRole("heading", { level: 1, name: /Where did you hear about/ })).toBeVisible();
  await chooseRadio(page, "Podcast");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 4 · Brand
  await expect(page.getByRole("heading", { level: 1, name: "Tell us about your brand" })).toBeVisible();
  await page.getByLabel("Brand Name").fill("Fern Test Goods");
  await page.getByLabel("Your website").fill("ferntestgoods.example");
  await page.getByLabel("Brand Description").fill("A test-only houseplant brand used by the end-to-end suite.");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 5 · Budget (no forecasting model: the estimate is honestly unavailable)
  await expect(page.getByRole("heading", { level: 1, name: "Set your daily budget" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Reach estimate" })).toContainText(/unavailable/i);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 6 · Summary
  await expect(page.getByRole("heading", { level: 1, name: "Here’s your plan so far" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Fern Test Goods");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 7 · Format
  await expect(page.getByRole("heading", { level: 1, name: "Choose a content format" })).toBeVisible();
  await chooseRadio(page, /^UGC/);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 8 · Template
  await expect(page.getByRole("heading", { level: 1, name: "Start from a template" })).toBeVisible();
  await page.locator("label").filter({ has: page.getByRole("radio") }).first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 9 · Billing threshold
  await expect(page.getByRole("heading", { level: 1, name: "How often do you want to be charged?" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 10 · Payment: Finish needs a provider-confirmed card, so it stays disabled.
  await expect(page.getByRole("heading", { level: 1, name: "You’re almost there" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Add payment method" }).click();
  await expect(page.getByText("Card payments aren’t available yet")).toBeVisible();
  await page.getByRole("button", { name: "I’ll finish later" }).click();

  // Lands in the playbook editor with the onboarding draft (nothing published).
  await page.waitForURL(/\/home\/[^/]+\/playbooks\/[^/]+\/edit/);
  const slug = slugFromUrl(page.url());
  const editorUrl = page.url();
  const banner = page.getByRole("banner");
  await expect(page.getByLabel("Playbook name")).toBeVisible();
  await expect(banner.getByRole("status").filter({ hasText: "Draft" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  // Edit → unsaved → explicit save → saved. Saving never publishes.
  const instructions = "E2E edit: film in daylight and keep it under 20 seconds.";
  await page.getByRole("textbox", { name: "General instructions" }).fill(instructions);
  await expect(banner.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
  await banner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(banner.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(banner.getByRole("status").filter({ hasText: "Draft" })).toBeVisible();

  // The saved draft survives a reload.
  await page.goto(editorUrl);
  await expect(page.getByRole("textbox", { name: "General instructions" })).toHaveValue(instructions);

  // Organic → Campaigns lists the onboarding campaign as inactive.
  await page.goto(`/home/${slug}/campaigns`);
  await expect(page.getByRole("heading", { level: 1, name: "Organic" })).toBeVisible();
  await page.getByRole("navigation", { name: "Organic views" }).getByRole("link", { name: /^Campaigns/ }).click();
  await expect(page).toHaveURL(/tab=campaigns/);
  const campaignRow = page.getByRole("region", { name: "Campaigns" }).getByRole("row", { name: /Fern Test Goods UGC/ });
  await expect(campaignRow).toHaveCount(1);
  await expect(campaignRow.getByRole("switch", { name: "Active: Fern Test Goods UGC" })).not.toBeChecked();
  await expect(campaignRow).toContainText("Inactive");
});
