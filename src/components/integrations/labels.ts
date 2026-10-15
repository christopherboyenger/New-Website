import type { Tone } from "@/components/ui/feedback";
import type { IntegrationProvider } from "@/server/db/schema/integrations";
import type { IntegrationErrorCategory } from "@/server/integrations/provider-error";
import type { DisplayStatus } from "@/server/integrations/installations";
import type { OAuthResult } from "@/server/integrations/oauth";

/** Client-safe copy for the Integrations page (no server imports at runtime: types only). */

export const statusLabels: Record<DisplayStatus, { label: string; tone: Tone }> = {
  not_configured: { label: "Not configured", tone: "neutral" },
  not_connected: { label: "Not connected", tone: "neutral" },
  awaiting_customer_grant: { label: "Awaiting authorization", tone: "info" },
  pending_app_review: { label: "Pending app review", tone: "info" },
  verifying: { label: "Awaiting verification", tone: "info" },
  connected: { label: "Connected", tone: "success" },
  limited_permissions: { label: "Limited permissions", tone: "warning" },
  reauthorization_required: { label: "Reconnect required", tone: "warning" },
  revocation_pending: { label: "Revocation pending", tone: "warning" },
  error: { label: "Error", tone: "danger" },
};

export const errorCategoryMessages: Record<IntegrationErrorCategory, string> = {
  invalid_credentials: "The provider rejected the credentials. Check the values (or create a new key) and try again.",
  insufficient_permissions: "The credentials work but don't have the permissions needed. Grant the required role or access and try again.",
  provider_rate_limited: "The provider is rate limiting requests right now. Try again in a few minutes.",
  provider_unreachable: "The provider couldn't be reached (network error or timeout). Try again shortly.",
  provider_error: "The provider returned an unexpected response. Try again; if it keeps happening, reconnect.",
  token_exchange_failed: "The provider didn't complete the authorization. Start the connection again.",
  no_eligible_assets: "The authorization didn't include any ad account you can use. Reconnect and select at least one account.",
  scopes_declined: "Some requested permissions were declined, so some features won't work. Reconnect and allow them to fix this.",
  revocation_failed: "The provider didn't confirm removing access. Access is already disabled here; remove the app in the provider's settings too.",
};

export function errorMessage(category: string | null): string | null {
  if (!category) return null;
  return (errorCategoryMessages as Record<string, string>)[category] ?? "The last attempt failed. Try again.";
}

export const providerNames: Record<IntegrationProvider, string> = {
  app_store_connect: "App Store Connect",
  google_play: "Google Play",
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
};

/** Message for the `?integration=…&result=…` redirect back from an OAuth start/callback. */
export function oauthResultMessage(provider: IntegrationProvider, result: OAuthResult, reason: string | null): { tone: "success" | "info" | "warning" | "danger"; text: string } {
  const name = providerNames[provider];
  switch (result) {
    case "connected":
      return { tone: "success", text: `${name} connected. Access was verified with a successful read.` };
    case "limited":
      return { tone: "warning", text: `${name} connected with limited permissions. ${errorMessage(reason) ?? ""}`.trim() };
    case "cancelled":
      return { tone: "info", text: `${name} authorization was cancelled or declined. Nothing was changed.` };
    case "expired":
      return { tone: "warning", text: "That authorization link expired or was already used. Start the connection again." };
    case "forbidden":
      return { tone: "danger", text: "The connection couldn't be completed for this account. Sign in as a workspace owner in the same browser session and try again." };
    case "not_configured":
      return { tone: "warning", text: `This product's ${name} app isn't configured on this deployment, so connections can't start yet.` };
    case "requires_recent_auth":
      return { tone: "warning", text: "Confirm your password, then start the connection again." };
    case "requires_verified_email":
      return { tone: "warning", text: "Verify your email address before connecting integrations." };
    case "failed":
    default:
      return { tone: "danger", text: `${name} couldn't be connected. ${errorMessage(reason) ?? "Try again."}` };
  }
}

export const oauthResults: readonly OAuthResult[] = [
  "connected",
  "limited",
  "cancelled",
  "failed",
  "expired",
  "forbidden",
  "not_configured",
  "requires_recent_auth",
  "requires_verified_email",
];

/** Deterministic UTC timestamp so server and client render the same text. */
export function formatUtc(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d)} UTC`;
}

export function formatUtcDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(d);
}
