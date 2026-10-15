"use server";

/**
 * Branding Server Action. Delegates to src/server/branding.ts, which
 * re-authorizes with requireOrgAction(slug, "branding:edit"), sanitizes the
 * description and applies the optimistic version check.
 */
import { revalidatePath } from "next/cache";
import { updateBranding } from "@/server/branding";

export async function saveBrandingAction(slug: string, input: Record<string, unknown>) {
  const result = await updateBranding(slug, input);
  // The workspace name appears in the shell (sidebar, switcher), so refresh the whole layout.
  if (result.ok) revalidatePath(`/home/${slug}`, "layout");
  return result;
}
