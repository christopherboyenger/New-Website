"use client";

import { useEffect, useState } from "react";
import type { ContentFormat } from "@/domain/playbook-content";
import type { Forecast } from "@/server/forecast";
import { estimateCampaignReachAction } from "@/server/campaign-form";
import type { CampaignFormSubmission } from "./model";

export type ReachEstimate =
  | { status: "pending" }
  /** Inputs can't be estimated yet (e.g. budget isn't a number). */
  | { status: "incomplete" }
  | { status: "error"; message: string }
  | { status: "ready"; forecast: Forecast };

export interface EstimateInput {
  dailyBudgetCents: number;
  format: ContentFormat;
  targeting: CampaignFormSubmission["targeting"];
}

/**
 * Re-requests the reach forecast when budget, format or targeting change
 * (debounced). While recomputing, the previous result is not shown as
 * current: the panel says it is updating (production-ui-plan.md "New budget
 * estimate"). The server-rendered estimate covers the initial defaults.
 */
export function useReachEstimate(slug: string, input: EstimateInput | null, initial: { key: string; forecast: Forecast }, delayMs = 600): ReachEstimate {
  const key = input ? JSON.stringify(input) : null;
  const [result, setResult] = useState<{ key: string; estimate: ReachEstimate }>({ key: initial.key, estimate: { status: "ready", forecast: initial.forecast } });

  useEffect(() => {
    if (!key || key === initial.key) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      let estimate: ReachEstimate;
      try {
        const res = await estimateCampaignReachAction(slug, JSON.parse(key) as EstimateInput);
        estimate = res.ok ? { status: "ready", forecast: res.data } : { status: "error", message: res.error };
      } catch {
        estimate = { status: "error", message: "Couldn't load the estimate. Check your connection and try again." };
      }
      if (!cancelled) setResult({ key, estimate });
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, key, initial.key, delayMs]);

  if (!key) return { status: "incomplete" };
  if (key === initial.key) return { status: "ready", forecast: initial.forecast };
  if (result.key === key) return result.estimate;
  return { status: "pending" };
}
