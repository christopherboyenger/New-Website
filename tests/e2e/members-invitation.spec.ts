import { expect, test } from "@playwright/test";
import { createBrandWorkspace, signUpBrandUser, uniqueEmail, verifyEmailViaOutbox } from "./support/helpers";

test("owner invites a member: honest not-delivered result, copied link, invitee verifies and joins without Billing", async ({ browser }) => {
  // Owner (own browser context, clipboard allowed for "Copy link").
  const ownerContext = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const owner = await ownerContext.newPage();
  const ownerEmail = uniqueEmail("owner");
  const slug = await createBrandWorkspace(owner, { email: ownerEmail, brandName: "Team Test Brand" });
  // Inviting teammates needs a verified address.
  await verifyEmailViaOutbox(owner, ownerEmail);
  await owner.goto(`/home/${slug}/members`);
  await expect(owner.getByRole("link", { name: "Billing", exact: true })).toHaveCount(1);

  const inviteeEmail = uniqueEmail("invitee");
  await owner.getByRole("button", { name: "Invite Members" }).click();
  const dialog = owner.getByRole("dialog", { name: "Invite Members to your Team" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Email" }).fill(inviteeEmail);
  await dialog.getByRole("button", { name: "Send Invites" }).click();

  // No email provider in this environment: the result says so and never claims a send.
  await expect(dialog.getByRole("status")).toHaveText("Here's what happened with each invitation:");
  await expect(dialog).toContainText(inviteeEmail);
  await expect(dialog).toContainText("Not emailed: no email provider is configured on this deployment.");
  await expect(dialog).not.toContainText("Invitation email sent.");
  const linkField = dialog.getByRole("textbox", { name: `Invite link for ${inviteeEmail}` });
  const shownLink = await linkField.inputValue();
  expect(shownLink).toMatch(/\/invitations\/[^/]+$/);

  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();
  const copiedLink = await owner.evaluate(() => navigator.clipboard.readText());
  expect(copiedLink).toBe(shownLink);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  const invitePath = new URL(copiedLink).pathname;

  // Invitee in a separate browser context: open the link while signed out.
  const inviteeContext = await browser.newContext();
  const invitee = await inviteeContext.newPage();
  await invitee.goto(invitePath);
  await expect(invitee.getByRole("heading", { name: "Join Team Test Brand" })).toBeVisible();
  await invitee.getByRole("link", { name: "Create an account" }).click();
  await expect(invitee).toHaveURL(/\/auth\/sign-up\?/);
  await expect(invitee.getByLabel("Email")).toHaveValue(inviteeEmail);
  await signUpBrandUser(invitee, { email: inviteeEmail, firstName: "Invited", next: invitePath });

  // Back on the invitation: joining needs a verified address first.
  await expect(invitee).toHaveURL(new RegExp(`${invitePath}$`));
  await expect(invitee.getByRole("heading", { name: "Verify your email first" })).toBeVisible();

  // The verification email was recorded, not delivered; follow it from the development outbox.
  await verifyEmailViaOutbox(invitee, inviteeEmail);

  // Accept explicitly; opening the link never joins by itself.
  await invitee.goto(invitePath);
  await invitee.getByRole("button", { name: "Join Team Test Brand" }).click();
  await invitee.waitForURL(new RegExp(`/home/${slug}$`));

  // Member view: the workspace is visible, Billing is not.
  await expect(invitee.getByRole("link", { name: "Members", exact: true })).toBeVisible();
  await expect(invitee.getByRole("link", { name: "Billing", exact: true })).toHaveCount(0);
  await invitee.goto(`/home/${slug}/billing`);
  await expect(invitee.getByRole("heading", { name: "Billing is visible to workspace owners only" })).toBeVisible();
  await expect(invitee.getByText("Payment method", { exact: true })).toHaveCount(0);

  // The owner now sees the new member.
  await owner.goto(`/home/${slug}/members`);
  await expect(owner.getByRole("main")).toContainText(inviteeEmail);
  // …and, unlike the member, still sees billing details.
  await owner.goto(`/home/${slug}/billing`);
  await expect(owner.getByText("Payment method", { exact: true })).toBeVisible();

  await inviteeContext.close();
  await ownerContext.close();
});
