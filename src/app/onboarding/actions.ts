"use server";

/**
 * Server Actions for the onboarding wizard. Each one re-authenticates and
 * authorizes inside src/server/onboarding.ts (the workspace is resolved from
 * the stored draft, never from client input).
 */
import { revalidatePath } from "next/cache";
import { beginPaymentSetup, checkPaymentStatus, completeOnboarding, estimateReach, saveOnboardingStep } from "@/server/onboarding";

export async function saveOnboardingStepAction(input: unknown) {
  const result = await saveOnboardingStep(input);
  // Saving brand basics creates or renames the workspace shown in the workspace switcher.
  if (result.ok && result.data.org) revalidatePath("/home", "layout");
  return result;
}

export async function estimateReachAction(input: unknown) {
  return estimateReach(input);
}

export async function beginPaymentSetupAction() {
  return beginPaymentSetup();
}

export async function checkPaymentStatusAction() {
  return checkPaymentStatus();
}

export async function completeOnboardingAction(input: unknown) {
  const result = await completeOnboarding(input);
  if (result.ok) revalidatePath("/home", "layout");
  return result;
}
