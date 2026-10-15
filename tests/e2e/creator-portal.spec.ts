import { expect, test, type Page } from "@playwright/test";
import { createBrandWorkspace, PASSWORD, uniqueEmail } from "./support/helpers";
import { markPaymentMethodReady } from "./support/test-hooks";

async function openToYou(page: Page) {
  await page.goto("/creator/campaigns");
  const section = page.getByRole("region", { name: "Open to you" });
  await expect(section).toBeVisible();
  return section;
}

test("creator sees no campaign until the brand publishes a playbook and activates its campaign", async ({ browser }) => {
  const run = Date.now().toString(36);
  const brandName = `Portal Brand ${run}`;
  const campaignName = `${brandName} UGC`;

  // Creator: sign up, nothing to join before an account is linked.
  const creatorContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  await creator.goto("/creator/sign-up");
  await creator.getByLabel("First name").fill("Casey");
  await creator.getByLabel("Last name").fill("Creator");
  await creator.getByLabel("Email").fill(uniqueEmail("creator"));
  await creator.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await creator.getByLabel("Creator name").fill(`Casey ${run}`);
  await creator.getByLabel("Country you live in").selectOption({ label: "United States" });
  await creator.getByRole("button", { name: "Create creator account" }).click();
  await creator.waitForURL((url) => !url.pathname.startsWith("/creator/sign-up"));
  await expect(creator).toHaveURL(/\/creator(\/|$)/);

  let available = await openToYou(creator);
  await expect(available.getByRole("heading", { name: "Link a social account first" })).toBeVisible();

  await creator.goto("/creator/profile#accounts");
  const addForm = creator.getByRole("form", { name: "Add an account" });
  await addForm.getByLabel("Platform").selectOption({ label: "TikTok" });
  await addForm.getByLabel("Handle").fill(`casey_${run}`);
  await addForm.getByRole("button", { name: "Add account" }).click();
  await expect(creator.getByRole("main")).toContainText(`@casey_${run}`);

  // Brand: a workspace with an inactive campaign and a draft playbook (from onboarding).
  const brandContext = await browser.newContext();
  const brand = await brandContext.newPage();
  const slug = await createBrandWorkspace(brand, { email: uniqueEmail("portal-brand"), brandName });
  const editorUrl = brand.url();

  available = await openToYou(creator);
  await expect(available).not.toContainText(campaignName);

  // Publishing is blocked without a payment method, and this deployment cannot take cards.
  await brand.getByRole("banner").getByRole("button", { name: "Publish", exact: true }).click();
  let publish = brand.getByRole("dialog", { name: "Publish playbook" });
  await expect(publish).toContainText("A payment method is required");
  await expect(publish).toContainText("card payments aren't configured on this deployment yet");
  await expect(publish.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await publish.getByRole("button", { name: "Cancel" }).click();

  // TEST-ONLY: stand in for a provider-confirmed card (tests/e2e/support/test-hooks.ts).
  await markPaymentMethodReady(brand, slug);

  // Publish through the real UI, available to creators while the campaign is active.
  await brand.goto(editorUrl);
  await brand.getByRole("banner").getByRole("button", { name: "Publish", exact: true }).click();
  publish = brand.getByRole("dialog", { name: "Publish playbook" });
  await expect(publish).not.toContainText("A payment method is required");
  const makeAvailable = publish.getByRole("checkbox", { name: "Make available to creators while the campaign is active" });
  await makeAvailable.check();
  await publish.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(publish).toBeHidden();
  await expect(brand.getByRole("banner").getByRole("status").filter({ hasText: /Published · rev 1/ })).toBeVisible();

  // Published but the campaign is still inactive: creators still see nothing from this brand.
  available = await openToYou(creator);
  await expect(available).not.toContainText(campaignName);

  // Activate the campaign (explicit confirmation).
  await brand.goto(`/home/${slug}/campaigns?tab=campaigns`);
  const row = brand.getByRole("region", { name: "Campaigns" }).getByRole("row", { name: new RegExp(campaignName) });
  await row.getByRole("switch", { name: `Active: ${campaignName}` }).click();
  const confirm = brand.getByRole("dialog", { name: `Activate ${campaignName}?` });
  await confirm.getByRole("button", { name: "Activate campaign" }).click();
  await expect(confirm).toBeHidden();
  await expect(row.getByRole("switch", { name: `Active: ${campaignName}` })).toBeChecked();

  // Now the creator is offered the campaign.
  available = await openToYou(creator);
  await expect(available).toContainText(campaignName);

  await brandContext.close();
  await creatorContext.close();
});
