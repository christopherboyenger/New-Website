import "server-only";
import type { IntegrationProvider } from "../../db/schema";
import { metaAdapter } from "./meta";
import { tiktokAdapter } from "./tiktok";
import type { OAuthAdapter, OAuthProvider } from "./types";

const adapters: Record<OAuthProvider, OAuthAdapter> = { meta_ads: metaAdapter, tiktok_ads: tiktokAdapter };

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === "meta_ads" || value === "tiktok_ads";
}

/** The OAuth adapter for a provider, or null for credential-based providers. */
export function oauthAdapter(provider: IntegrationProvider): OAuthAdapter | null {
  return isOAuthProvider(provider) ? adapters[provider] : null;
}
