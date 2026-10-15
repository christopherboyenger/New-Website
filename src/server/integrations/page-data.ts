import "server-only";
import { reportingApiBaseUrl } from "@/config/site";
import { apiScopeDescriptions, issuableApiScopes, listApiGrants, type ApiGrantView } from "../api-grants";
import { hasPermission, type OrgContext } from "../authz";
import { capability } from "../readiness";
import { googlePlayServiceAccountEmail } from "./google-play";
import { RECENT_AUTH_MINUTES } from "./guards";
import { loadIntegrationsOverview, type IntegrationOverview } from "./installations";

export interface IntegrationsPageData {
  overviews: IntegrationOverview[];
  canManage: boolean;
  canManageTokens: boolean;
  blockedReason: string | null;
  recentAuthExpiresAt: string | null;
  googlePlayServiceAccountEmail: string | null;
  mcp: { configured: boolean; detail: string };
  orgId: string;
  apiBaseUrl: string;
  grants: ApiGrantView[] | null;
  scopes: Array<{ value: string; description: string }>;
}

/** Everything the Integrations page renders, for an already-authorized context. Never includes credential material. */
export async function loadIntegrationsPageData(ctx: OrgContext): Promise<IntegrationsPageData> {
  const canManage = hasPermission(ctx, "integrations:manage");
  const canManageTokens = hasPermission(ctx, "api_tokens:manage");
  const [overviews, grants] = await Promise.all([loadIntegrationsOverview(ctx.org.id), canManageTokens ? listApiGrants(ctx.org.id) : Promise.resolve(null)]);
  const mcp = capability("mcp");
  const recentAuthUntil = ctx.session.recentAuthAt.getTime() + RECENT_AUTH_MINUTES * 60_000;
  return {
    overviews,
    canManage,
    canManageTokens,
    blockedReason:
      (canManage || canManageTokens) && !ctx.user.emailVerifiedAt
        ? "Verify your email address before connecting integrations or managing API tokens."
        : null,
    recentAuthExpiresAt: recentAuthUntil > Date.now() ? new Date(recentAuthUntil).toISOString() : null,
    googlePlayServiceAccountEmail: googlePlayServiceAccountEmail(),
    mcp: { configured: mcp.configured, detail: mcp.detail },
    orgId: ctx.org.id,
    apiBaseUrl: reportingApiBaseUrl(),
    grants,
    scopes: issuableApiScopes.map((value) => ({ value, description: apiScopeDescriptions[value] })),
  };
}
