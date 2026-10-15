"use server";

/**
 * Join-request decisions. decideJoinRequest re-authorizes with
 * requireOrgAction(slug, "creator:manage") and only touches requests that
 * belong to the authorized org.
 */
import { revalidatePath } from "next/cache";
import { decideJoinRequest } from "@/server/campaign-admission";

export async function approveJoinRequestAction(slug: string, input: { campaignId: string; creatorId: string }) {
  const result = await decideJoinRequest(slug, input, "approve");
  if (result.ok) revalidatePath(`/home/${slug}`, "layout");
  return result;
}

export async function rejectJoinRequestAction(slug: string, input: { campaignId: string; creatorId: string }) {
  const result = await decideJoinRequest(slug, input, "reject");
  if (result.ok) revalidatePath(`/home/${slug}`, "layout");
  return result;
}
