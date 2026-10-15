import "server-only";
import { isSafeReturnPath } from "@/server/auth/session";

export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a query parameter, if it is a non-empty string. */
export function firstParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** A same-origin return path from `?next=`, or null. Auth pages are never a return target. */
export function safeNextParam(value: string | string[] | undefined): string | null {
  const next = firstParam(value);
  if (!next || next.length > 2000 || !isSafeReturnPath(next)) return null;
  return next === "/auth" || next.startsWith("/auth/") || next.startsWith("/auth?") ? null : next;
}

/** An email prefill from `?email=` (shown as a default value only, never trusted). */
export function emailParam(value: string | string[] | undefined): string {
  const email = firstParam(value)?.trim() ?? "";
  return email.length <= 254 ? email : "";
}

export function withNext(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
