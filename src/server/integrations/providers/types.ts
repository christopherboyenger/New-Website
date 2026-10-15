import "server-only";

export type OAuthProvider = "meta_ads" | "tiktok_ads";

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date | null;
}

export interface IntegrationAsset {
  id: string;
  name: string;
  kind: string;
}

/** What the token can actually do, read back from the provider (never the requested scopes). */
export interface OAuthGrant {
  grantedScopes: string[];
  assets: IntegrationAsset[];
}

export type CallbackOutcome = { kind: "code"; code: string } | { kind: "cancelled" };

export interface OAuthAdapter {
  provider: OAuthProvider;
  /** Whether PKCE (S256) is sent; only where the provider has confirmed support. */
  supportsPkce: boolean;
  configured(): boolean;
  authorizeUrl(input: { state: string; redirectUri: string; scopes: readonly string[] }): string;
  /** Interprets the provider's callback query (code vs. cancelled/denied). */
  readCallback(params: URLSearchParams): CallbackOutcome;
  exchangeCode(input: { code: string; redirectUri: string }): Promise<OAuthTokenSet>;
  /** A real read with the new token: granted scopes and the assets it can access. */
  readGrant(tokens: OAuthTokenSet): Promise<OAuthGrant>;
  revoke(tokens: OAuthTokenSet): Promise<void>;
}
