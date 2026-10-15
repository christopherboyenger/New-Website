import "server-only";
import { earningPolicyOpenDecisions, type EarningPolicy } from "@/domain/earnings";

/**
 * Earning policy configuration. No policy has been decided by the business,
 * so none is configured: earning jobs must check `earningPolicyConfigured()`
 * and do nothing while it is false. There is intentionally no fallback rate.
 */
export function configuredEarningPolicy(): EarningPolicy | null {
  return null;
}

export function earningPolicyConfigured(): boolean {
  return configuredEarningPolicy() !== null;
}

/** The open decisions shown in the console while earnings are not configured. */
export function earningPolicyDecisionsRequired(): readonly string[] {
  return earningPolicyConfigured() ? [] : earningPolicyOpenDecisions;
}
