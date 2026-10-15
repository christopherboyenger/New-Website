"use client";

import { useEffect, useState } from "react";
import { checkCampaignHashtagAction } from "@/server/campaign-form";

export type HashtagAvailability =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; tag: string }
  | { status: "taken"; tag: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

/**
 * Debounced live availability check for the Primary Hashtag field. Results
 * are keyed by the value they were computed for, so a stale response never
 * describes newer input; until the current value is checked, it is "checking".
 */
export function useHashtagAvailability(slug: string, hashtag: string, delayMs = 400): HashtagAvailability {
  const value = hashtag.trim();
  const [result, setResult] = useState<{ value: string; availability: HashtagAvailability } | null>(null);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      let availability: HashtagAvailability;
      try {
        const res = await checkCampaignHashtagAction(slug, value);
        if (!res.ok) availability = { status: "error", message: res.code === "rate_limited" ? res.error : "Couldn't check availability right now. It's checked again when you create the campaign." };
        else if (res.data.status === "invalid") availability = { status: "invalid", message: res.data.message };
        else availability = { status: res.data.status, tag: res.data.tag };
      } catch {
        availability = { status: "error", message: "Couldn't check availability right now. It's checked again when you create the campaign." };
      }
      if (!cancelled) setResult({ value, availability });
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, value, delayMs]);

  if (!value) return { status: "idle" };
  if (result?.value === value) return result.availability;
  return { status: "checking" };
}
