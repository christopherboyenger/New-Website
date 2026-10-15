"use client";

import type { ActionResult } from "@/server/action-result";
import type { ApiGrantView, CreatedGrant } from "@/server/api-grants";
import type { AppStoreConnectResult } from "@/server/integrations/app-store-connect";
import type { IntegrationOverview } from "@/server/integrations/installations";
import type { IntegrationProvider } from "@/server/db/schema/integrations";
import { AdPlatformCard } from "./ad-platform-card";
import { AppStoreConnectCard } from "./app-store-connect-card";
import { DeveloperCard, McpCard } from "./developer-card";
import { GooglePlayCard } from "./google-play-card";
import { StepUpProvider } from "./step-up";

type Disconnect = () => Promise<ActionResult<{ outcome: "disconnected" | "revocation_pending" }>>;

export interface IntegrationsBoardProps {
  slug: string;
  productName: string;
  overviews: IntegrationOverview[];
  canManage: boolean;
  /** Why sensitive changes are blocked right now (e.g. unverified email), or null. */
  blockedReason: string | null;
  recentAuthExpiresAt: string | null;
  googlePlayServiceAccountEmail: string | null;
  mcp: { configured: boolean; detail: string };
  focus: { provider: IntegrationProvider; banner: { tone: "success" | "info" | "warning" | "danger"; text: string } } | null;
  developer: {
    orgId: string;
    apiBaseUrl: string;
    referenceHref: string;
    grants: ApiGrantView[] | null;
    scopes: Array<{ value: string; description: string }>;
  };
  actions: {
    confirmPassword: (password: string) => Promise<ActionResult<{ confirmedAt: string }>>;
    connectAppStoreConnect: (input: { issuerId: string; keyId: string; privateKey: string }) => Promise<ActionResult<AppStoreConnectResult>>;
    connectGooglePlay: (input: { packageName: string; bucketId: string }) => Promise<ActionResult<{ status: "verifying" }>>;
    disconnect: (provider: IntegrationProvider) => ReturnType<Disconnect>;
    createToken: (input: { label: string; scopes: string[]; expiry: string }) => Promise<ActionResult<CreatedGrant>>;
    revokeToken: (input: { id: string }) => Promise<ActionResult<{ id: string }>>;
  };
}

export function IntegrationsBoard(props: IntegrationsBoardProps) {
  const { slug, productName, overviews, canManage, blockedReason, focus, actions } = props;
  const byProvider = new Map(overviews.map((o) => [o.provider, o]));
  const overview = (p: IntegrationProvider) => byProvider.get(p)!;
  const disconnect = (p: IntegrationProvider): Disconnect => () => actions.disconnect(p);
  const common = { productName, canManage, blockedReason };

  return (
    <StepUpProvider recentAuthExpiresAt={props.recentAuthExpiresAt} confirm={actions.confirmPassword}>
      <div className="flex flex-col gap-4">
        <AppStoreConnectCard
          {...common}
          overview={overview("app_store_connect")}
          defaultOpen={focus?.provider === "app_store_connect"}
          connect={actions.connectAppStoreConnect}
          disconnect={disconnect("app_store_connect")}
        />
        <GooglePlayCard
          {...common}
          overview={overview("google_play")}
          serviceAccountEmail={props.googlePlayServiceAccountEmail}
          defaultOpen={focus?.provider === "google_play"}
          connect={actions.connectGooglePlay}
          disconnect={disconnect("google_play")}
        />
        {(["meta_ads", "tiktok_ads"] as const).map((p) => (
          <AdPlatformCard
            key={p}
            {...common}
            provider={p}
            slug={slug}
            overview={overview(p)}
            defaultOpen={focus?.provider === p}
            banner={focus?.provider === p ? focus.banner : null}
            disconnect={disconnect(p)}
          />
        ))}
        <McpCard productName={productName} configured={props.mcp.configured} detail={props.mcp.detail} />
        <DeveloperCard
          {...props.developer}
          blockedReason={blockedReason}
          createToken={actions.createToken}
          revokeToken={actions.revokeToken}
        />
      </div>
    </StepUpProvider>
  );
}
