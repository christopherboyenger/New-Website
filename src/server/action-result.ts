import "server-only";
import { z } from "zod";
import { EntitlementError } from "@/domain/entitlements";
import { ForbiddenError, NotFoundError } from "./authz";
import { CredentialEncryptionUnavailableError } from "./crypto";

/**
 * Uniform Server Action result. Actions return failures as data (never throw
 * to the client) so forms can keep their state and show field errors.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: ActionErrorCode };

export type ActionErrorCode =
  | "validation"
  | "forbidden"
  | "not_found"
  | "entitlement"
  | "conflict"
  | "rate_limited"
  | "not_configured"
  | "requires_recent_auth"
  | "requires_verified_email"
  | "internal";

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, code: ActionErrorCode = "validation", fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, code, fieldErrors };
}

export function fromZodError(error: z.ZodError, message = "Check the highlighted fields."): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, error: message, code: "validation", fieldErrors };
}

/** Optimistic-concurrency failure: the entity changed since the client loaded it. */
export class ConflictError extends Error {
  constructor(message = "This was changed elsewhere. Reload to see the latest version before saving again.") {
    super(message);
    this.name = "ConflictError";
  }
}

/** Maps known domain/auth errors to results; unknown errors are logged without payloads and reported generically. */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ForbiddenError) return fail(error.message, "forbidden");
    if (error instanceof NotFoundError) return fail(error.message, "not_found");
    if (error instanceof EntitlementError) return fail(error.message, "entitlement");
    if (error instanceof ConflictError) return fail(error.message, "conflict");
    if (error instanceof CredentialEncryptionUnavailableError) return fail("Secure credential storage is not configured on this deployment.", "not_configured");
    if (isNextControlFlow(error)) throw error;
    console.error("[action] unexpected error:", error instanceof Error ? error.name + ": " + error.message : "unknown");
    return fail("Something went wrong. Your changes were not saved.", "internal");
  }
}

/** redirect()/notFound() throw special errors that must propagate. */
function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}
