/**
 * Role permission matrix (docs/decisions.md DEC-005). Documented rules: Owners
 * have full control; Members do not control campaigns or billing; only the
 * primary owner transfers ownership; owners manage teammates below their level.
 * The Member column beyond that is a product decision recorded here once.
 */
import type { Role } from "@/server/db/schema/core";

export const permissions = [
  "workspace:read",
  "campaign:manage",
  "playbook:edit",
  "playbook:publish",
  "creator:manage",
  "ads:launch",
  "ad_settings:edit",
  "branding:edit",
  "members:invite",
  "members:manage",
  "integrations:manage",
  "api_tokens:manage",
  "billing:view",
  "billing:manage",
  "ownership:transfer",
  "messages:use",
] as const;
export type Permission = (typeof permissions)[number];

const memberPermissions: ReadonlySet<Permission> = new Set<Permission>([
  "workspace:read",
  "playbook:edit",
  "messages:use",
]);

export interface Actor {
  role: Role;
  isPrimaryOwner: boolean;
}

export function can(actor: Actor, permission: Permission): boolean {
  if (permission === "ownership:transfer") return actor.isPrimaryOwner;
  if (actor.role === "owner") return true;
  return memberPermissions.has(permission);
}

/** Rank used for "only below their own level": primary owner > owner > member. */
function rank(actor: Actor): number {
  if (actor.isPrimaryOwner) return 3;
  return actor.role === "owner" ? 2 : 1;
}

/** Whether `actor` may change the role of / remove `target` (never themselves). */
export function canManageTeammate(actor: Actor, target: Actor, sameUser: boolean): boolean {
  if (sameUser) return false;
  if (!can(actor, "members:manage")) return false;
  return rank(actor) > rank(target);
}

/** Roles an actor may grant when inviting or changing roles. */
export function grantableRoles(actor: Actor): Role[] {
  if (actor.isPrimaryOwner) return ["owner", "member"];
  if (actor.role === "owner") return ["member"];
  return [];
}

export const permissionDeniedMessages: Partial<Record<Permission, string>> = {
  "campaign:manage": "Only workspace owners can create or change campaigns.",
  "playbook:publish": "Only workspace owners can publish playbooks.",
  "billing:view": "Billing is visible to workspace owners only.",
  "billing:manage": "Only workspace owners can manage billing.",
  "members:invite": "Only workspace owners can invite teammates.",
  "integrations:manage": "Only workspace owners can connect or disconnect integrations.",
  "api_tokens:manage": "Only workspace owners can manage API tokens.",
  "ownership:transfer": "Only the primary owner can transfer ownership.",
};
