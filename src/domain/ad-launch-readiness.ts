/**
 * Whether an ad-platform installation can be used to build launch drafts.
 * Only an installation in status `connected` qualifies, and it must have been
 * granted every launch scope for its provider (a Meta connection made for
 * reporting only carries `ads_read`, which can't create ads).
 * Pure: used by the Ads server code and its UI.
 */
import type { AdProvider } from "./tracking-params";

export const launchScopes: Record<AdProvider, readonly string[]> = {
  meta_ads: ["ads_management"],
  // TikTok's launch permissions are granted per app (not per OAuth scope string), so none are checked here.
  tiktok_ads: [],
};

export function missingLaunchScopes(provider: AdProvider, grantedScopes: readonly string[]): string[] {
  return launchScopes[provider].filter((scope) => !grantedScopes.includes(scope));
}

export function isLaunchReady(installation: { provider: AdProvider; status: string; grantedScopes: readonly string[] }): boolean {
  return installation.status === "connected" && missingLaunchScopes(installation.provider, installation.grantedScopes).length === 0;
}
