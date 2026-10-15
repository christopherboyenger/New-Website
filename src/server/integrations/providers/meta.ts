import "server-only";
import { createHmac } from "node:crypto";
import { env } from "../../env";
import { categoryForStatus, ProviderError, providerFetch, readJson } from "../provider-error";
import type { OAuthAdapter, OAuthGrant, OAuthTokenSet } from "./types";

/**
 * Meta Marketing API adapter (this product's own Meta app: META_APP_ID /
 * META_APP_SECRET). Pinned Graph API version — verify it against the app
 * dashboard when the app is registered (docs/decisions/integrations.md).
 * PKCE is not used: the code is exchanged server-side with the app secret and
 * Meta's support for PKCE on this flow has not been confirmed.
 */
export const META_GRAPH_VERSION = "v24.0";
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Capabilities are requested separately: reporting never asks for ads_management. */
export const metaCapabilityScopes = {
  reporting: ["ads_read"],
  launch: ["ads_read", "ads_management"],
} as const;
export type MetaCapability = keyof typeof metaCapabilityScopes;

function app() {
  const { META_APP_ID, META_APP_SECRET } = env();
  if (!META_APP_ID || !META_APP_SECRET) throw new ProviderError("provider_error");
  return { id: META_APP_ID, secret: META_APP_SECRET };
}

/** appsecret_proof binds Graph calls to this app's secret, so a leaked token alone is less useful. */
function appSecretProof(accessToken: string): string {
  return createHmac("sha256", app().secret).update(accessToken).digest("hex");
}

async function graphGet(path: string, accessToken: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("appsecret_proof", appSecretProof(accessToken));
  const response = await providerFetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new ProviderError(categoryForStatus(response.status));
  return readJson(response);
}

export const metaAdapter: OAuthAdapter = {
  provider: "meta_ads",
  supportsPkce: false,

  configured() {
    const e = env();
    return Boolean(e.META_APP_ID && e.META_APP_SECRET);
  },

  authorizeUrl({ state, redirectUri, scopes }) {
    const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", app().id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));
    // Lets a person grant a permission they previously declined.
    url.searchParams.set("auth_type", "rerequest");
    return url.toString();
  },

  readCallback(params) {
    if (params.get("error") || params.get("error_reason")) return { kind: "cancelled" };
    const code = params.get("code");
    return code ? { kind: "code", code } : { kind: "cancelled" };
  },

  async exchangeCode({ code, redirectUri }): Promise<OAuthTokenSet> {
    const { id, secret } = app();
    const url = new URL(`${GRAPH}/oauth/access_token`);
    url.searchParams.set("client_id", id);
    url.searchParams.set("client_secret", secret);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code", code);
    const response = await providerFetch(url.toString());
    if (!response.ok) throw new ProviderError("token_exchange_failed");
    const short = (await readJson(response)) as { access_token?: unknown };
    if (typeof short.access_token !== "string") throw new ProviderError("token_exchange_failed");

    // Exchange for a long-lived user token; expiry comes from the response, never assumed.
    const longUrl = new URL(`${GRAPH}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", id);
    longUrl.searchParams.set("client_secret", secret);
    longUrl.searchParams.set("fb_exchange_token", short.access_token);
    const longResponse = await providerFetch(longUrl.toString());
    if (!longResponse.ok) throw new ProviderError("token_exchange_failed");
    const long = (await readJson(longResponse)) as { access_token?: unknown; expires_in?: unknown };
    if (typeof long.access_token !== "string") throw new ProviderError("token_exchange_failed");
    const expiresAt = typeof long.expires_in === "number" ? new Date(Date.now() + long.expires_in * 1000) : null;
    return { accessToken: long.access_token, expiresAt };
  },

  async readGrant(tokens): Promise<OAuthGrant> {
    const permissions = (await graphGet("/me/permissions", tokens.accessToken)) as { data?: Array<{ permission?: unknown; status?: unknown }> };
    const grantedScopes = (permissions.data ?? [])
      .filter((p) => p.status === "granted" && typeof p.permission === "string")
      .map((p) => p.permission as string);
    const accounts = (await graphGet("/me/adaccounts", tokens.accessToken, { fields: "id,name", limit: "200" })) as {
      data?: Array<{ id?: unknown; name?: unknown }>;
    };
    const assets = (accounts.data ?? [])
      .filter((a) => typeof a.id === "string")
      .map((a) => ({ id: a.id as string, name: typeof a.name === "string" && a.name ? a.name : (a.id as string), kind: "ad_account" }));
    return { grantedScopes, assets };
  },

  async revoke(tokens) {
    const url = new URL(`${GRAPH}/me/permissions`);
    url.searchParams.set("appsecret_proof", appSecretProof(tokens.accessToken));
    const response = await providerFetch(url.toString(), { method: "DELETE", headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    if (!response.ok) throw new ProviderError("revocation_failed");
  },
};
