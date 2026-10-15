"use server";

/**
 * Invitation acceptance. The token from the URL only selects the invitation
 * (by digest); the signed-in account must match the invited email and be
 * verified (src/server/invitations.ts).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { destroyCurrentSession } from "@/server/auth/session";
import { acceptInvitation } from "@/server/invitations";

export async function acceptInvitationAction(token: string) {
  const result = await acceptInvitation(token);
  if (!result.ok) return result;
  revalidatePath("/home", "layout");
  redirect(`/home/${result.data.slug}`);
}

/** Wrong-account recovery: sign out, then sign in again and come back to this invitation. */
export async function signOutForInvitationAction(token: string) {
  await destroyCurrentSession();
  redirect(`/auth/sign-in?next=${encodeURIComponent(`/invitations/${encodeURIComponent(token)}`)}`);
}
