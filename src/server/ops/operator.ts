import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getCurrentSession, type CurrentSession } from "../auth/session";
import { NotFoundError } from "../authz";
import { operatorEmails } from "../env";

/**
 * Operator console authorization. An operator is a signed-in, enabled user
 * whose VERIFIED email address is listed in OPERATOR_EMAILS. Everyone else —
 * signed out, unlisted, or listed but unverified — sees the same 404 as a
 * nonexistent page, so the console's existence is not disclosed.
 *
 * Operator status grants only the console's own views and review commands;
 * it never implies membership of a brand workspace, billing access or
 * access to provider credentials.
 */
export type OperatorContext = CurrentSession;

export function isOperatorUser(user: { email: string; emailVerifiedAt: Date | null; disabledAt: Date | null }): boolean {
  if (!user.emailVerifiedAt || user.disabledAt) return false;
  return operatorEmails().has(user.email.trim().toLowerCase());
}

/** The current operator, or null. Deduplicated per request. */
export const loadOperatorContext = cache(async (): Promise<OperatorContext | null> => {
  const current = await getCurrentSession();
  if (!current || !isOperatorUser(current.user)) return null;
  return current;
});

/** For console pages and layouts: 404 unless the viewer is an operator. */
export async function requireOperatorPage(): Promise<OperatorContext> {
  const ctx = await loadOperatorContext();
  if (!ctx) notFound();
  return ctx;
}

/** For operator Server Actions: throws NotFoundError (mapped to a not_found result) unless the caller is an operator. */
export async function requireOperatorAction(): Promise<OperatorContext> {
  const ctx = await loadOperatorContext();
  if (!ctx) throw new NotFoundError("Not found");
  return ctx;
}
