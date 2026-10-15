"use server";

/**
 * Server Actions for the Organic page. Each delegates to a server module that
 * re-authorizes with requireOrgAction(slug, permission) and qualifies every
 * query with the authorized org; nothing from the client selects the tenant.
 * Successful writes revalidate the workspace so Home and Organic reflect the
 * confirmed server state.
 */
import { revalidatePath } from "next/cache";
import { changeCampaignBudgetForSlug, changeCampaignStatusForSlug, changePlaybookActiveForSlug } from "@/server/campaign-status";
import { createPlaybookForSlug, loadBreakdownForSlug } from "@/server/organic";

function revalidateWorkspace(slug: string) {
  revalidatePath(`/home/${slug}`, "layout");
}

export async function changeCampaignStatusAction(slug: string, input: unknown) {
  const result = await changeCampaignStatusForSlug(slug, input);
  if (result.ok) revalidateWorkspace(slug);
  return result;
}

export async function changeCampaignBudgetAction(slug: string, input: unknown) {
  const result = await changeCampaignBudgetForSlug(slug, input);
  if (result.ok) revalidateWorkspace(slug);
  return result;
}

export async function changePlaybookActiveAction(slug: string, input: unknown) {
  const result = await changePlaybookActiveForSlug(slug, input);
  if (result.ok) revalidateWorkspace(slug);
  return result;
}

export async function createPlaybookAction(slug: string, input: unknown) {
  const result = await createPlaybookForSlug(slug, input);
  if (result.ok) revalidateWorkspace(slug);
  return result;
}

export async function loadBreakdownAction(slug: string, input: unknown) {
  return loadBreakdownForSlug(slug, input);
}
