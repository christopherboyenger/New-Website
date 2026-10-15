import "server-only";
import { env } from "../../env";
import { categoryForStatus, ProviderError, providerFetch, readJson } from "../provider-error";
import type { OAuthAdapter, OAuthGrant, OAuthTokenSet } from "./types";

/**
 * TikTok API for Business adapter (this product's own Business app:
 * TIKTOK_BUSINESS_APP_ID / TIKTOK_BUSINESS_APP_SECRET). Advertiser
 * authorization happens on TikTok's portal, where the person picks the
 * advertiser accounts to grant; the permission scopes are configured on the
 * app, so none are sent in the authorize URL. No PKCE: the Business portal
 * flow does not document it. API version is pinned.
 */
export const TIKTOK_BUSINESS_API_VERSION = "v1.3";
const API = `https://business-api.tiktok.com/open_api/${TIKTOK_BUSINESS_API_VERSION}`;

interface TikTokEnvelope<T> {
  code?: unknown;
  message?: unknown;
  data?: T;
}

function app() {
  const { TIKTOK_BUSINESS_APP_ID, TIKTOK_BUSINESS_APP_SECRET } = env();
  if (!TIKTOK_BUSINESS_APP_ID || !TIKTOK_BUSINESS_APP_SECRET) throw new ProviderError("provider_error");
  return { id: TIKTOK_BUSINESS_APP_ID, secret: TIKTOK_BUSINESS_APP_SECRET };
}

/** TikTok returns HTTP 200 with a non-zero `code` for most failures. */
function unwrap<T>(body: TikTokEnvelope<T>, failure: ProviderError): T {
  // Specific numeric codes are not mapped until verified against the approved app's API version.
  if (body.code !== 0 || !body.data) throw failure;
  return body.data;
}

export const tiktokAdapter: OAuthAdapter = {
  provider: "tiktok_ads",
  supportsPkce: false,

  configured() {
    const e = env();
    return Boolean(e.TIKTOK_BUSINESS_APP_ID && e.TIKTOK_BUSINESS_APP_SECRET);
  },

  authorizeUrl({ state, redirectUri }) {
    const url = new URL("https://business-api.tiktok.com/portal/auth");
    url.searchParams.set("app_id", app().id);
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri);
    return url.toString();
  },

  readCallback(params) {
    const code = params.get("auth_code") ?? params.get("code");
    return code ? { kind: "code", code } : { kind: "cancelled" };
  },

  async exchangeCode({ code }): Promise<OAuthTokenSet> {
    const { id, secret } = app();
    const response = await providerFetch(`${API}/oauth2/access_token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: id, secret, auth_code: code }),
    });
    if (!response.ok) throw new ProviderError("token_exchange_failed");
    const data = unwrap((await readJson(response)) as TikTokEnvelope<{ access_token?: unknown }>, new ProviderError("token_exchange_failed"));
    if (typeof data.access_token !== "string") throw new ProviderError("token_exchange_failed");
    // Business advertiser tokens carry no documented expiry in this response; none is assumed.
    return { accessToken: data.access_token, expiresAt: null };
  },

  async readGrant(tokens): Promise<OAuthGrant> {
    const { id, secret } = app();
    const url = new URL(`${API}/oauth2/advertiser/get/`);
    url.searchParams.set("app_id", id);
    url.searchParams.set("secret", secret);
    const response = await providerFetch(url.toString(), { headers: { "Access-Token": tokens.accessToken } });
    if (!response.ok) throw new ProviderError(categoryForStatus(response.status));
    const data = unwrap(
      (await readJson(response)) as TikTokEnvelope<{ list?: Array<{ advertiser_id?: unknown; advertiser_name?: unknown }> }>,
      new ProviderError("provider_error"),
    );
    const assets = (data.list ?? [])
      .filter((a) => typeof a.advertiser_id === "string" || typeof a.advertiser_id === "number")
      .map((a) => {
        const advertiserId = String(a.advertiser_id);
        return { id: advertiserId, name: typeof a.advertiser_name === "string" && a.advertiser_name ? a.advertiser_name : advertiserId, kind: "advertiser" };
      });
    // Advertiser-level authorization is the grant; scopes are fixed by the app's approved permissions.
    return { grantedScopes: assets.length ? ["advertiser_authorization"] : [], assets };
  },

  async revoke(tokens) {
    const { id, secret } = app();
    const response = await providerFetch(`${API}/oauth2/revoke_token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: id, secret, access_token: tokens.accessToken }),
    });
    if (!response.ok) throw new ProviderError("revocation_failed");
    unwrap((await readJson(response)) as TikTokEnvelope<unknown>, new ProviderError("revocation_failed"));
  },
};
