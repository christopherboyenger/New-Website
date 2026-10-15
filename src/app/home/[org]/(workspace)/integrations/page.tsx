import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";
import { loadOrgContext, requireOrgPage } from "@/server/authz";
import { integrationProviders, type IntegrationProvider } from "@/server/db/schema/integrations";
import { loadIntegrationsPageData } from "@/server/integrations/page-data";
import type { OAuthResult } from "@/server/integrations/oauth";
import { IntegrationsBoard } from "@/components/integrations/integrations-board";
import { oauthResultMessage, oauthResults } from "@/components/integrations/labels";
import { InlineAlert } from "@/components/ui/feedback";
import { PageContainer, PageHeader } from "@/components/ui/layout";
import {
  confirmPasswordAction,
  connectAppStoreConnectAction,
  connectGooglePlayAction,
  createApiTokenAction,
  disconnectIntegrationAction,
  revokeApiTokenAction,
} from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Integrations · ${ctx.org.name}` : "Integrations" };
}

function first(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : Array.isArray(value) ? (value[0] ?? null) : null;
}

/** The card to open after an OAuth round trip (`?integration=meta_ads&result=connected`). */
function readFocus(searchParams: Record<string, string | string[] | undefined>) {
  const provider = first(searchParams.integration);
  const result = first(searchParams.result);
  if (!provider || !(integrationProviders as readonly string[]).includes(provider)) return null;
  if (!result || !(oauthResults as readonly string[]).includes(result)) return null;
  const reason = first(searchParams.reason);
  return {
    provider: provider as IntegrationProvider,
    banner: oauthResultMessage(provider as IntegrationProvider, result as OAuthResult, reason && /^[a-z_]{1,40}$/.test(reason) ? reason : null),
  };
}

/** Integrations (L15–L16, B08–B09): provider cards with real verification state, AI assistant, and Reporting API tokens. */
export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/integrations`);
  const data = await loadIntegrationsPageData(ctx);
  const focus = readFocus(await searchParams);
  const referenceHref = `/home/${ctx.org.slug}/integrations/api`;

  return (
    <PageContainer className="pt-8 sm:pt-10" width="narrow">
      <PageHeader
        title="Integrations"
        description={
          <>
            Connect your app store accounts, ad accounts, AI clients and reporting tools. Endpoints, parameters and examples are in the{" "}
            <Link href={referenceHref} className="text-ink underline underline-offset-2 hover:text-ink-2">
              Reporting API reference
            </Link>
            .
          </>
        }
      />
      <div className="flex flex-col gap-4">
        {data.blockedReason ? (
          <InlineAlert tone="warning" title="Email verification needed">
            {data.blockedReason}
          </InlineAlert>
        ) : null}
        {!data.canManage ? (
          <InlineAlert tone="info">You can see each integration&apos;s status. Only workspace owners can connect or disconnect integrations and manage API tokens.</InlineAlert>
        ) : null}
        {focus && (focus.provider === "app_store_connect" || focus.provider === "google_play") ? (
          <InlineAlert tone={focus.banner.tone}>{focus.banner.text}</InlineAlert>
        ) : null}
        <IntegrationsBoard
          slug={ctx.org.slug}
          productName={site.name}
          overviews={data.overviews}
          canManage={data.canManage}
          blockedReason={data.blockedReason}
          recentAuthExpiresAt={data.recentAuthExpiresAt}
          googlePlayServiceAccountEmail={data.googlePlayServiceAccountEmail}
          mcp={data.mcp}
          focus={focus}
          developer={{ orgId: data.orgId, apiBaseUrl: data.apiBaseUrl, referenceHref, grants: data.grants, scopes: data.scopes }}
          actions={{
            confirmPassword: confirmPasswordAction.bind(null, ctx.org.slug),
            connectAppStoreConnect: connectAppStoreConnectAction.bind(null, ctx.org.slug),
            connectGooglePlay: connectGooglePlayAction.bind(null, ctx.org.slug),
            disconnect: disconnectIntegrationAction.bind(null, ctx.org.slug),
            createToken: createApiTokenAction.bind(null, ctx.org.slug),
            revokeToken: revokeApiTokenAction.bind(null, ctx.org.slug),
          }}
        />
      </div>
    </PageContainer>
  );
}
