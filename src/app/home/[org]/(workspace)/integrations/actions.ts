"use server";

/**
 * Integrations Server Actions. Each delegates to src/server/integrations/* or
 * src/server/api-grants.ts, which re-authorize with requireOrgAction, require
 * a verified email and a recent password confirmation, and qualify every
 * query with the authorized organization.
 */
import { revalidatePath } from "next/cache";
import { integrationProviders, type IntegrationProvider } from "@/server/db/schema";
import { createApiGrant, revokeApiGrant } from "@/server/api-grants";
import { connectAppStoreConnect } from "@/server/integrations/app-store-connect";
import { connectGooglePlay } from "@/server/integrations/google-play";
import { confirmRecentAuth } from "@/server/integrations/guards";
import { disconnectIntegration } from "@/server/integrations/installations";
import { fail, runAction } from "@/server/action-result";

function revalidate(slug: string) {
  revalidatePath(`/home/${slug}/integrations`);
}

export async function confirmPasswordAction(slug: string, password: string) {
  return runAction(() => confirmRecentAuth(slug, typeof password === "string" ? password : ""));
}

export async function connectAppStoreConnectAction(slug: string, input: { issuerId: string; keyId: string; privateKey: string }) {
  const result = await connectAppStoreConnect(slug, input);
  if (result.ok) revalidate(slug);
  return result;
}

export async function connectGooglePlayAction(slug: string, input: { packageName: string; bucketId: string }) {
  const result = await connectGooglePlay(slug, input);
  if (result.ok) revalidate(slug);
  return result;
}

export async function disconnectIntegrationAction(slug: string, provider: IntegrationProvider) {
  if (!(integrationProviders as readonly string[]).includes(provider)) return fail("Unknown integration.", "not_found");
  const result = await disconnectIntegration(slug, provider);
  if (result.ok) revalidate(slug);
  return result;
}

export async function createApiTokenAction(slug: string, input: { label: string; scopes: string[]; expiry: string }) {
  const result = await createApiGrant(slug, input);
  if (result.ok) revalidate(slug);
  return result;
}

export async function revokeApiTokenAction(slug: string, input: { id: string }) {
  const result = await revokeApiGrant(slug, input);
  if (result.ok) revalidate(slug);
  return result;
}
