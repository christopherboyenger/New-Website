import { expect, test } from "@playwright/test";
import { createBrandWorkspace, uniqueEmail } from "./support/helpers";

test("campaign creation form shows validation errors, then creates an inactive campaign", async ({ page }) => {
  const slug = await createBrandWorkspace(page, { email: uniqueEmail("campaigns"), brandName: "Form Test Brand" });
  await page.goto(`/home/${slug}/campaigns/new`);
  await expect(page.getByRole("heading", { level: 1, name: "New campaign" })).toBeVisible();

  const form = page.getByRole("form", { name: "New campaign" });
  const name = form.getByRole("textbox", { name: "Campaign Name" });
  const hashtag = form.getByRole("textbox", { name: "Primary Hashtag" });
  const create = page.getByRole("button", { name: "Create campaign" });

  // Reach estimate is honestly unavailable; creating states it does not activate or charge.
  await expect(page.getByRole("region", { name: "Estimates" })).toContainText("Reach estimate unavailable");
  await expect(page.getByRole("complementary", { name: "Estimates" })).toContainText("Creating doesn't activate or charge anything.");

  // Empty submit: form-level alert plus messages tied to each field.
  await create.click();
  await expect(form.getByRole("alert")).toContainText("Check the highlighted fields.");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(/Enter a campaign name\./);
  await expect(hashtag).toHaveAccessibleDescription(/Use 2–50 letters, numbers or underscores\./);
  await expect(page.getByRole("navigation", { name: "Campaign sections" })).toContainText("Needs attention");

  // An invalid hashtag is still rejected once the name is valid.
  await name.fill("E2E Spring Launch");
  await hashtag.fill("bad tag!");
  await create.click();
  await expect(hashtag).toHaveAccessibleDescription(/Use 2–50 letters, numbers or underscores\./);
  await expect(page).toHaveURL(/\/campaigns\/new$/);

  // Valid input creates the campaign; it starts Inactive.
  const tag = `e2e${Date.now().toString(36)}`;
  await hashtag.fill(`#${tag.toUpperCase()}`);
  await create.click();
  await page.waitForURL(/\/campaigns\?.*tab=campaigns/);
  const row = page.getByRole("region", { name: "Campaigns" }).getByRole("row", { name: /E2E Spring Launch/ });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("switch", { name: "Active: E2E Spring Launch" })).not.toBeChecked();
  await expect(row).toContainText("Inactive");
});
