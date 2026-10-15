import "server-only";

/**
 * Sanitized failure categories stored on installations and shown in the UI.
 * Provider response bodies, tokens and keys are never stored or logged; only
 * one of these categories is.
 */
export const integrationErrorCategories = [
  "invalid_credentials",
  "insufficient_permissions",
  "provider_rate_limited",
  "provider_unreachable",
  "provider_error",
  "token_exchange_failed",
  "no_eligible_assets",
  "scopes_declined",
  "revocation_failed",
] as const;
export type IntegrationErrorCategory = (typeof integrationErrorCategories)[number];

export class ProviderError extends Error {
  constructor(public readonly category: IntegrationErrorCategory) {
    super(`Provider call failed: ${category}`);
    this.name = "ProviderError";
  }
}

export const PROVIDER_TIMEOUT_MS = 10_000;

/** Maps an HTTP status from a provider read to a category. */
export function categoryForStatus(status: number): IntegrationErrorCategory {
  if (status === 401) return "invalid_credentials";
  if (status === 403) return "insufficient_permissions";
  if (status === 429) return "provider_rate_limited";
  return "provider_error";
}

/**
 * fetch with a short timeout. Network failures and timeouts become
 * `provider_unreachable`; the original error (which may contain URLs with
 * credentials) is not propagated.
 */
export async function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch {
    throw new ProviderError("provider_unreachable");
  }
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderError("provider_error");
  }
}
