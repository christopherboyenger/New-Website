"use server";

/**
 * Billing Server Actions. Each delegates to src/server/billing/commands.ts,
 * which re-authorizes from the slug with requireOrgAction (owner-only
 * `billing:manage`; `billing:view` for status checks) and never accepts an
 * organization or provider customer from the client.
 */
import { revalidatePath } from "next/cache";
import {
  beginPaymentMethodSetup,
  beginPlanManagement,
  beginPlanUpgrade,
  refreshPaymentStatus,
  updateBillingThreshold,
  updateBusinessInformation,
} from "@/server/billing/commands";

const billingPath = (slug: string) => `/home/${slug}/billing`;

export async function startPaymentSetupAction(slug: string) {
  const result = await beginPaymentMethodSetup(slug);
  revalidatePath(billingPath(slug));
  return result;
}

export async function refreshPaymentStatusAction(slug: string) {
  const result = await refreshPaymentStatus(slug);
  if (result.ok) revalidatePath(billingPath(slug));
  return result;
}

export async function startUpgradeAction(slug: string) {
  return beginPlanUpgrade(slug);
}

export async function startPlanManagementAction(slug: string) {
  return beginPlanManagement(slug);
}

export async function updateThresholdAction(slug: string, input: { thresholdCents: number; expectedVersion: number }) {
  const result = await updateBillingThreshold(slug, input);
  if (result.ok) revalidatePath(`/home/${slug}`, "layout");
  return result;
}

export async function updateBusinessInfoAction(slug: string, input: Record<string, string>) {
  const result = await updateBusinessInformation(slug, input);
  if (result.ok) revalidatePath(billingPath(slug));
  return result;
}
