"use server";

/**
 * Creators roster Server Actions. Each delegates to src/server/creators-roster.ts,
 * which re-authorizes with requireOrgAction(slug, "creator:manage") and only
 * touches creators on the authorized org's roster.
 */
import { revalidatePath } from "next/cache";
import { removeCreators, restoreCreators } from "@/server/creators-roster";

export async function removeCreatorsAction(slug: string, input: { creatorIds: string[] }) {
  const result = await removeCreators(slug, input);
  if (result.ok) revalidatePath(`/home/${slug}`, "layout");
  return result;
}

export async function restoreCreatorsAction(slug: string, input: { creatorIds: string[] }) {
  const result = await restoreCreators(slug, input);
  if (result.ok) revalidatePath(`/home/${slug}`, "layout");
  return result;
}
