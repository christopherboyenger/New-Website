"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Megaphone, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert, NotConfiguredNotice } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/action-result";
import type { IntegrationOverview } from "@/server/integrations/installations";
import { DisconnectButton, InstallationDetails, IntegrationCard } from "./card-parts";
import { useStepUp } from "./step-up";

type OAuthProviderKey = "meta_ads" | "tiktok_ads";

export interface AdPlatformCardProps {
  provider: OAuthProviderKey;
  slug: string;
  productName: string;
  overview: IntegrationOverview;
  canManage: boolean;
  blockedReason: string | null;
  defaultOpen: boolean;
  banner: { tone: "success" | "info" | "warning" | "danger"; text: string } | null;
  disconnect: () => Promise<ActionResult<{ outcome: "disconnected" | "revocation_pending" }>>;
}

const copy: Record<OAuthProviderKey, { title: string; icon: ReactNode; description: (name: string) => string; assetLabel: string; appName: string }> = {
  meta_ads: {
    title: "Meta Ads",
    icon: <Megaphone className="size-4" />,
    description: (name) => `Connect your Meta ad account so ${name} can read ad reporting and, if you allow it, build creator posts as ads in the ad sets you choose.`,
    assetLabel: "Ad accounts",
    appName: "Meta",
  },
  tiktok_ads: {
    title: "TikTok Ads",
    icon: <Music2 className="size-4" />,
    description: (name) => `Connect your TikTok Ads Manager account so ${name} can read ad reporting and build creator posts as ads in the ad groups you choose.`,
    assetLabel: "Advertiser accounts",
    appName: "TikTok for Business",
  },
};

/**
 * Meta Ads / TikTok Ads: OAuth via this product's own app. The start is a
 * same-origin form POST to /api/integrations/{provider}/start, which redirects
 * to the provider; the callback verifies the grant before anything is stored.
 */
export function AdPlatformCard({ provider, slug, productName, overview, canManage, blockedReason, defaultOpen, banner, disconnect }: AdPlatformCardProps) {
  const c = copy[provider];
  const installation = overview.installation;
  const live = installation && installation.status !== "disconnected";
  const canStart = overview.configured && canManage && !blockedReason;
  const reconnecting = live && installation.status !== "revocation_pending";

  return (
    <IntegrationCard
      id={provider}
      icon={c.icon}
      title={c.title}
      description={c.description(productName)}
      status={overview.displayStatus}
      summary={
        live && installation.selectedAssets.length
          ? `${installation.selectedAssets.length} ${c.assetLabel.toLowerCase()}${installation.connectedBy ? ` · connected by ${installation.connectedBy}` : ""}`
          : undefined
      }
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-col gap-5">
        {banner ? <InlineAlert tone={banner.tone}>{banner.text}</InlineAlert> : null}

        {!overview.configured ? (
          <NotConfiguredNotice title={`This product's ${c.appName} app isn't configured`}>
            {productName} needs its own registered {c.appName} app before ad accounts can be connected, so connections can&apos;t start on this deployment.
          </NotConfiguredNotice>
        ) : null}

        {installation && installation.status === "revocation_pending" ? (
          <InlineAlert tone="warning" title="Disconnected here, provider removal not confirmed">
            {productName} no longer uses this connection, but {c.appName} didn&apos;t confirm removing access. Remove {productName} from your {c.appName} business
            settings, then mark it as removed.
          </InlineAlert>
        ) : null}

        {installation && live && installation.status !== "revocation_pending" ? (
          <InstallationDetails installation={installation} assetLabel={c.assetLabel} />
        ) : null}

        {provider === "meta_ads" ? (
          <MetaConnectOptions slug={slug} canStart={canStart} reconnecting={Boolean(reconnecting)} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-2">
              You&apos;ll be sent to TikTok for Business to authorize {productName}. You pick exactly which advertiser accounts to share; access is verified with a
              read before anything is saved.
            </p>
            <div>
              <OAuthStartForm provider="tiktok_ads" slug={slug} disabled={!canStart} variant="primary">
                {reconnecting ? "Reconnect TikTok" : "Connect TikTok"}
              </OAuthStartForm>
            </div>
          </div>
        )}

        {canManage && live ? (
          <div className="flex flex-wrap gap-2">
            <DisconnectButton
              providerName={c.title}
              label={installation.status === "revocation_pending" ? "Mark as removed" : "Disconnect"}
              disconnect={disconnect}
              disabled={Boolean(blockedReason)}
              consequence={
                installation.status === "revocation_pending" ? (
                  <p>Confirm you removed {productName}&apos;s access in {c.appName}. The warning will be cleared.</p>
                ) : (
                  <p>
                    {productName} stops using this connection immediately and its stored token is destroyed. {productName} then asks {c.appName} to revoke access;
                    if that fails you&apos;ll be told to remove it there yourself. Running ads are not paused by disconnecting.
                  </p>
                )
              }
            />
          </div>
        ) : null}
        {!canManage ? <p className="text-[13px] text-muted">Only workspace owners can connect or disconnect {c.title}.</p> : null}
        {blockedReason && canManage ? <p className="text-[13px] text-muted">{blockedReason}</p> : null}
      </div>
    </IntegrationCard>
  );
}

function MetaConnectOptions({ slug, canStart, reconnecting }: { slug: string; canStart: boolean; reconnecting: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">Choose what to allow. You&apos;ll be sent to Meta to choose the ad accounts to share; permissions are requested separately.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
          <OAuthStartForm provider="meta_ads" slug={slug} capability="reporting" disabled={!canStart} variant="primary">
            {reconnecting ? "Reconnect for reporting" : "Connect for reporting"}
          </OAuthStartForm>
          <p className="text-[13px] text-muted">
            Requests <code className="font-mono">ads_read</code> only: spend and delivery reporting for the ad accounts you choose.
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
          <OAuthStartForm provider="meta_ads" slug={slug} capability="launch" disabled={!canStart} variant="secondary">
            {reconnecting ? "Reconnect with ad launch" : "Connect with ad launch"}
          </OAuthStartForm>
          <p className="text-[13px] text-muted">
            Also requests <code className="font-mono">ads_management</code> so creator posts can be built as ads. Ads are only created when you launch them.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Form POST navigation; the password step-up happens first when the confirmation is stale. */
function OAuthStartForm({
  provider,
  slug,
  capability,
  disabled,
  variant,
  children,
}: {
  provider: OAuthProviderKey;
  slug: string;
  capability?: "reporting" | "launch";
  disabled: boolean;
  variant: "primary" | "secondary";
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const { ensureRecentAuth } = useStepUp();
  // Coming back from the provider via the browser's back button restores this page from cache.
  useEffect(() => {
    const reset = () => setBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <form
      ref={formRef}
      method="post"
      action={`/api/integrations/${provider}/start`}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const ok = await ensureRecentAuth();
        if (!ok) {
          setBusy(false);
          return;
        }
        // form.submit() navigates without re-running this handler.
        formRef.current?.submit();
      }}
    >
      <input type="hidden" name="org" value={slug} />
      {capability ? <input type="hidden" name="capability" value={capability} /> : null}
      <Button type="submit" variant={variant} size="sm" loading={busy} disabled={disabled} className="max-md:min-h-11">
        {children}
      </Button>
    </form>
  );
}
