import { expect, test } from "@playwright/test";
import { createBrandWorkspace, PASSWORD, uniqueEmail, verifyEmailViaOutbox } from "./support/helpers";

test("owner creates an API token behind a password step-up; the token reads only its own workspace", async ({ browser, request }) => {
  const run = Date.now().toString(36);

  // Another workspace whose data must never appear in the first one's API responses.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  const otherBrand = `Other API Brand ${run}`;
  await createBrandWorkspace(other, { email: uniqueEmail("api-other"), brandName: otherBrand });
  await otherContext.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail("api-owner");
  const brand = `API Brand ${run}`;
  const slug = await createBrandWorkspace(page, { email, brandName: brand });
  await verifyEmailViaOutbox(page, email);

  // The session's password confirmation is fresh right after sign-up; move the browser clock past its
  // 30-minute window so the step-up dialog is exercised (the server re-checks independently).
  await page.clock.install({ time: new Date(Date.now() + 31 * 60_000) });
  await page.goto(`/home/${slug}/integrations`);
  const developer = page.getByRole("region", { name: "Developer" });
  await expect(developer).toContainText("No API tokens yet.");
  await developer.getByRole("button", { name: "Create token" }).click();

  const createDialog = page.getByRole("dialog", { name: "Create API token" });
  await createDialog.getByRole("textbox", { name: "Name" }).fill("E2E warehouse sync");
  await createDialog.getByRole("checkbox", { name: /campaigns:read/ }).check();
  await createDialog.getByRole("button", { name: "Create token" }).click();

  // Password step-up: a wrong password is refused, the right one continues the creation.
  const stepUp = page.getByRole("dialog", { name: "Confirm your password" });
  await expect(stepUp).toBeVisible();
  await stepUp.getByLabel("Password").fill("not the right password");
  await stepUp.getByRole("button", { name: "Confirm" }).click();
  await expect(stepUp.getByRole("alert")).toBeVisible();
  await stepUp.getByLabel("Password").fill(PASSWORD);
  await stepUp.getByRole("button", { name: "Confirm" }).click();
  await expect(stepUp).toBeHidden();

  // Shown once.
  const shown = page.getByRole("dialog", { name: "Copy your new token" });
  await expect(shown).toContainText("This is the only time the token is shown");
  const token = ((await shown.locator("code").first().textContent()) ?? "").trim();
  expect(token).toMatch(/^rk_/);
  await shown.getByRole("button", { name: "Done" }).click();
  await expect(developer.getByRole("table")).toContainText("E2E warehouse sync");
  await expect(developer.getByRole("table")).not.toContainText(token);

  // curl-equivalent requests (no cookies): the token alone selects the workspace.
  const ok = await request.get("/api/v1/campaigns", { headers: { Authorization: `Bearer ${token}` } });
  expect(ok.status()).toBe(200);
  expect(ok.headers()["cache-control"]).toContain("no-store");
  const body = (await ok.json()) as { data: Array<{ id: string; name: string; active: boolean }> };
  expect(body.data.map((c) => c.name)).toEqual([`${brand} UGC`]);
  expect(body.data[0]).toMatchObject({ active: false });
  expect(JSON.stringify(body)).not.toContain(otherBrand);

  const wrong = await request.get("/api/v1/campaigns", { headers: { Authorization: `Bearer ${token.slice(0, -4)}xxxx` } });
  expect(wrong.status()).toBe(401);
  expect(wrong.headers()["www-authenticate"]).toContain("Bearer");
  expect(((await wrong.json()) as { error: { code: string } }).error.code).toBe("unauthorized");

  const missing = await request.get("/api/v1/campaigns");
  expect(missing.status()).toBe(401);

  // Scopes are enforced: this token was not granted playbooks:read.
  const playbooks = await request.get("/api/v1/playbooks", { headers: { Authorization: `Bearer ${token}` } });
  expect(playbooks.status()).toBe(403);

  await context.close();
});
