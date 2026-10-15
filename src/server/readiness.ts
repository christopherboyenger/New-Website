import "server-only";
import { credentialEncryptionConfigured } from "./crypto";
import { emailProviderConfigured } from "./email";
import { env, isProduction } from "./env";

/**
 * Deployment capability readiness (production-requirements.md §5: implemented →
 * provisioned → authorized/reviewed → verified → enabled live). This reports
 * only what the server can know: whether credentials/resources are present.
 * It never claims a provider review, customer grant, or end-to-end test passed.
 */
export type CapabilityKey =
  | "database"
  | "email"
  | "payments"
  | "payment_webhooks"
  | "credential_custody"
  | "meta_ads"
  | "tiktok_ads"
  | "google_play"
  | "app_store_connect"
  | "media_storage"
  | "forecasting"
  | "ai_authoring"
  | "mcp"
  | "creator_payouts";

export interface CapabilityState {
  key: CapabilityKey;
  label: string;
  configured: boolean;
  detail: string;
}

export function capability(key: CapabilityKey): CapabilityState {
  return capabilities().find((c) => c.key === key)!;
}

export function capabilities(): CapabilityState[] {
  const e = env();
  const encryption = safe(credentialEncryptionConfigured);
  return [
    {
      key: "database",
      label: "Database",
      configured: Boolean(e.DATABASE_URL),
      detail: e.DATABASE_URL
        ? "Postgres connection configured."
        : isProduction()
          ? "DATABASE_URL is not set."
          : "Using the embedded development database (.data/pglite). Not for production.",
    },
    {
      key: "email",
      label: "Transactional email",
      configured: emailProviderConfigured(),
      detail: emailProviderConfigured() ? "Email provider configured." : "No email provider: invitations and verification emails are recorded but not delivered.",
    },
    {
      key: "payments",
      label: "Card payments",
      configured: Boolean(e.STRIPE_SECRET_KEY),
      detail: e.STRIPE_SECRET_KEY ? "Payment provider keys configured." : "Payment provider not configured: cards cannot be added.",
    },
    {
      key: "payment_webhooks",
      label: "Payment webhooks",
      configured: Boolean(e.STRIPE_WEBHOOK_SECRET),
      detail: e.STRIPE_WEBHOOK_SECRET ? "Webhook signing secret configured." : "Webhook signing secret not configured: payment results cannot be confirmed.",
    },
    {
      key: "credential_custody",
      label: "Credential encryption",
      configured: encryption,
      detail: encryption ? "Tenant credentials are envelope-encrypted." : "CREDENTIALS_ENCRYPTION_KEY not set: provider secrets cannot be accepted.",
    },
    {
      key: "meta_ads",
      label: "Meta Ads app",
      configured: Boolean(e.META_APP_ID && e.META_APP_SECRET),
      detail: e.META_APP_ID ? "App credentials configured; customer authorization and app review still apply." : "This product's Meta app is not registered/configured.",
    },
    {
      key: "tiktok_ads",
      label: "TikTok Ads app",
      configured: Boolean(e.TIKTOK_BUSINESS_APP_ID && e.TIKTOK_BUSINESS_APP_SECRET),
      detail: e.TIKTOK_BUSINESS_APP_ID ? "App credentials configured; advertiser authorization still applies." : "This product's TikTok Business app is not registered/configured.",
    },
    {
      key: "google_play",
      label: "Google Play reporting identity",
      configured: Boolean(e.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL),
      detail: e.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL
        ? "Service account identity configured; each customer must invite it."
        : "No service account identity configured for this product.",
    },
    {
      key: "app_store_connect",
      label: "App Store Connect",
      configured: encryption,
      detail: encryption ? "Customer keys can be stored securely; verification calls the App Store Connect API." : "Requires credential encryption to accept customer keys.",
    },
    { key: "media_storage", label: "Media storage", configured: false, detail: "No object storage provisioned: uploads are disabled; external links can be referenced." },
    { key: "forecasting", label: "Reach forecasting", configured: false, detail: "No forecasting model configured: estimates show as unavailable." },
    { key: "ai_authoring", label: "AI authoring", configured: false, detail: "No AI model access provisioned." },
    { key: "mcp", label: "MCP server", configured: false, detail: "MCP authorization server not yet deployed for this product." },
    { key: "creator_payouts", label: "Creator payouts", configured: false, detail: "Payout platform (e.g. Stripe Connect) not configured." },
  ];
}

function safe(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
