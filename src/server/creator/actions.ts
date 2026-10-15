"use server";

/**
 * Creator portal Server Actions. Each delegates to a command that resolves
 * the creator from the session (never from client input) and returns an
 * ActionResult; these wrappers only adapt form data and revalidate.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "../action-result";
import { joinCampaign } from "../campaign-admission";
import { submitPost } from "./fulfillment";
import { addSocialAccount, createCreatorProfile, removeSocialAccount, signUpCreator, updateCreatorProfile } from "./profile";

export type CreatorFormState<T = undefined> = ActionResult<T> & { values?: Record<string, string> };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signUpCreatorAction(_prev: CreatorFormState | null, formData: FormData): Promise<CreatorFormState> {
  const values = {
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    email: field(formData, "email"),
    displayName: field(formData, "displayName"),
    country: field(formData, "country"),
  };
  const result = await signUpCreator({ ...values, password: field(formData, "password") });
  if (!result.ok) return { ...result, values };
  redirect("/creator");
}

export async function createCreatorProfileAction(_prev: CreatorFormState | null, formData: FormData): Promise<CreatorFormState> {
  const values = { displayName: field(formData, "displayName"), country: field(formData, "country") };
  const result = await createCreatorProfile(values);
  if (!result.ok) return { ...result, values };
  redirect("/creator");
}

export async function updateCreatorProfileAction(_prev: CreatorFormState | null, formData: FormData): Promise<CreatorFormState> {
  const values = { displayName: field(formData, "displayName"), country: field(formData, "country") };
  const result = await updateCreatorProfile(values);
  if (result.ok) revalidatePath("/creator", "layout");
  return { ...result, values };
}

export async function addSocialAccountAction(_prev: CreatorFormState<{ id: string }> | null, formData: FormData): Promise<CreatorFormState<{ id: string }>> {
  const values = { platform: field(formData, "platform"), handle: field(formData, "handle"), dedicated: field(formData, "dedicated") };
  const result = await addSocialAccount({
    platform: values.platform,
    handle: values.handle,
    dedicated: values.dedicated === "on",
  });
  if (result.ok) {
    revalidatePath("/creator", "layout");
    return result;
  }
  return { ...result, values };
}

export async function removeSocialAccountAction(accountId: string): Promise<ActionResult> {
  const result = await removeSocialAccount({ accountId });
  if (result.ok) revalidatePath("/creator", "layout");
  return result;
}

export async function joinCampaignAction(campaignId: string): Promise<ActionResult<{ status: "requested" | "approved" }>> {
  const result = await joinCampaign({ campaignId });
  if (result.ok) revalidatePath("/creator", "layout");
  return result;
}

export async function submitPostAction(
  target: { campaignId: string; playbookId: string },
  _prev: CreatorFormState<{ postId: string; adRightsGranted: boolean }> | null,
  formData: FormData,
): Promise<CreatorFormState<{ postId: string; adRightsGranted: boolean }>> {
  const values = { socialAccountId: field(formData, "socialAccountId"), url: field(formData, "url"), caption: field(formData, "caption"), grantAdRights: field(formData, "grantAdRights") };
  const result = await submitPost({
    campaignId: target.campaignId,
    playbookId: target.playbookId,
    socialAccountId: values.socialAccountId,
    url: values.url,
    caption: values.caption,
    grantAdRights: values.grantAdRights === "on",
  });
  if (result.ok) {
    revalidatePath("/creator", "layout");
    return result;
  }
  return { ...result, values };
}
