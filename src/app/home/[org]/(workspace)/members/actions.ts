"use server";

/**
 * Members and invitations Server Actions. Each delegates to src/server/members.ts
 * or src/server/invitations.ts, which re-authorize with requireOrgAction and
 * qualify every query with the authorized org.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@/server/db/schema/core";
import { createInvitations, renewInvitation, revokeInvitation } from "@/server/invitations";
import { changeMemberRole, leaveWorkspace, removeMember, transferOwnership } from "@/server/members";

function revalidateMembers(slug: string) {
  revalidatePath(`/home/${slug}/members`);
}

export async function inviteMembersAction(slug: string, input: { emails: string[]; role: Role }) {
  const result = await createInvitations(slug, input);
  if (result.ok) revalidateMembers(slug);
  return result;
}

export async function renewInvitationAction(slug: string, input: { id: string }) {
  const result = await renewInvitation(slug, input);
  if (result.ok) revalidateMembers(slug);
  return result;
}

export async function revokeInvitationAction(slug: string, input: { id: string }) {
  const result = await revokeInvitation(slug, input);
  if (result.ok) revalidateMembers(slug);
  return result;
}

export async function changeMemberRoleAction(slug: string, input: { userId: string; role: Role }) {
  const result = await changeMemberRole(slug, input);
  if (result.ok) revalidateMembers(slug);
  return result;
}

export async function removeMemberAction(slug: string, input: { userId: string }) {
  const result = await removeMember(slug, input);
  if (result.ok) revalidateMembers(slug);
  return result;
}

export async function transferOwnershipAction(slug: string, input: { userId: string; password: string }) {
  const result = await transferOwnership(slug, input);
  if (result.ok) revalidatePath(`/home/${slug}`, "layout");
  return result;
}

/** On success the member no longer has access, so they are sent to /home (next workspace or onboarding). */
export async function leaveWorkspaceAction(slug: string) {
  const result = await leaveWorkspace(slug);
  if (!result.ok) return result;
  revalidatePath("/home", "layout");
  redirect("/home");
}
