/**
 * Token-substituted ad text: destination URL parameters (Ad settings → Links &
 * parameters, L27) and body-copy templates (Copy templates, L11).
 *
 * Tokens use double braces. Two kinds exist:
 * - product tokens, resolved by this product when a launch draft is built
 *   ({{platform}} in URLs; {{creator}}, {{handle}}, {{brand}}, {{hashtag}} in copy);
 * - provider macros, passed through untouched for the ad platform to fill at
 *   click time (Meta's {{adset.id}} etc.). Meta macros are Meta-only: a URL
 *   parameter that uses one is left out of the TikTok URL and reported.
 *
 * Pure and framework-free; used by the settings editor, the launch-draft form
 * and the server commands.
 */
import { z } from "zod";
import type { LinkSettings } from "@/server/db/schema/integrations";

export type { LinkSettings };

export const adPlatforms = ["meta", "tiktok"] as const;
export type AdPlatform = (typeof adPlatforms)[number];

export const adPlatformLabels: Record<AdPlatform, string> = { meta: "Meta", tiktok: "TikTok" };

export type AdProvider = "meta_ads" | "tiktok_ads";
export const providerPlatform: Record<AdProvider, AdPlatform> = { meta_ads: "meta", tiktok_ads: "tiktok" };

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Names of every {{token}} in `text`, in order of appearance. */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN_RE)].map((m) => m[1]);
}

/**
 * Meta dynamic URL parameters (Meta Business Help Center, "URL parameters").
 * Re-verify against the pinned Marketing API version before enabling launch.
 */
export const metaUrlMacros = [
  "ad.id",
  "ad.name",
  "adset.id",
  "adset.name",
  "campaign.id",
  "campaign.name",
  "placement",
  "site_source_name",
] as const;

const metaMacroSet: ReadonlySet<string> = new Set(metaUrlMacros);
export const URL_PRODUCT_TOKENS = ["platform"] as const;

export const MAX_URL_PARAMS = 20;
const KEY_RE = /^[A-Za-z0-9_.\-[\]]{1,64}$/;

/** Accepts only absolute https URLs with a real host. */
export function parseWebsiteUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;
  return url;
}

const paramSchema = z.object({
  key: z.string().trim().regex(KEY_RE, "Use letters, numbers, and _ . - [ ] (up to 64 characters)."),
  value: z
    .string()
    .trim()
    .max(200, "Keep the value to 200 characters or fewer.")
    .refine((v) => tokensIn(v).every((t) => t === "platform" || metaMacroSet.has(t)), {
      message: "Use {{platform}} or a supported Meta macro such as {{adset.id}}.",
    })
    .refine((v) => !/[{}]/.test(v.replace(TOKEN_RE, "")), { message: "Close every token with double braces, e.g. {{platform}}." }),
});

export const linkSettingsSchema = z
  .object({
    websiteUrl: z
      .string()
      .trim()
      .max(2000, "Keep the URL to 2,000 characters or fewer.")
      .refine((v) => v === "" || parseWebsiteUrl(v) !== null, { message: "Enter a full https:// address, e.g. https://example.com." }),
    params: z.array(paramSchema).max(MAX_URL_PARAMS, `Use at most ${MAX_URL_PARAMS} parameters.`),
  })
  .superRefine((value, ctx) => {
    const seen = new Map<string, number>();
    value.params.forEach((p, i) => {
      const k = p.key.toLowerCase();
      if (seen.has(k)) ctx.addIssue({ code: "custom", path: ["params", i, "key"], message: `"${p.key}" is already used. Each parameter key can appear once.` });
      else seen.set(k, i);
    });
    if (value.params.length > 0 && value.websiteUrl === "") {
      ctx.addIssue({ code: "custom", path: ["websiteUrl"], message: "Add a website URL for these parameters." });
    }
  });

export interface ResolvedUrl {
  /** Null when no website URL is configured. */
  url: string | null;
  /** Parameters left out for this platform, with the reason. */
  omitted: Array<{ key: string; reason: string }>;
}

/** Encodes a value, keeping provider macros literal so the ad platform can fill them. */
function encodeValue(value: string): string {
  let out = "";
  let last = 0;
  for (const m of value.matchAll(TOKEN_RE)) {
    out += encodeURIComponent(value.slice(last, m.index));
    out += `{{${m[1]}}}`;
    last = m.index + m[0].length;
  }
  return out + encodeURIComponent(value.slice(last));
}

/**
 * The destination URL for one platform: {{platform}} becomes "meta" or
 * "tiktok"; Meta macros stay literal on Meta and drop the parameter on
 * TikTok. A parameter key already in the website URL is replaced.
 */
export function resolveTrackingUrl(links: LinkSettings, platform: AdPlatform): ResolvedUrl {
  const base = parseWebsiteUrl(links.websiteUrl);
  if (!base) return { url: null, omitted: [] };
  const omitted: ResolvedUrl["omitted"] = [];
  const pairs: string[] = [];
  const replacedKeys = new Set<string>();
  for (const p of links.params) {
    const key = p.key.trim();
    if (!key) continue;
    const tokens = tokensIn(p.value);
    if (platform !== "meta" && tokens.some((t) => metaMacroSet.has(t))) {
      omitted.push({ key, reason: "Uses a Meta-only macro" });
      continue;
    }
    const substituted = p.value.trim().replace(TOKEN_RE, (whole, name: string) => (name === "platform" ? platform : whole));
    replacedKeys.add(key);
    pairs.push(`${encodeURIComponent(key)}=${encodeValue(substituted)}`);
  }
  for (const key of replacedKeys) base.searchParams.delete(key);
  const existing = base.search.replace(/^\?/, "");
  const query = [existing, ...pairs].filter(Boolean).join("&");
  const url = `${base.origin}${base.pathname}${query ? `?${query}` : ""}${base.hash}`;
  return { url, omitted };
}

/* ------------------------------------------------------------- copy templates */

export const copyTokens = [
  { token: "creator", label: "Creator name", example: "Example Creator" },
  { token: "handle", label: "Creator handle", example: "@example.creator" },
  { token: "brand", label: "Your brand name", example: "Example Brand" },
  { token: "hashtag", label: "Campaign hashtag", example: "#examplecampaign" },
] as const;
export type CopyToken = (typeof copyTokens)[number]["token"];
const copyTokenSet: ReadonlySet<string> = new Set(copyTokens.map((t) => t.token));

export const MAX_COPY_TEMPLATES = 10;
export const MAX_COPY_LENGTH = 2000;

export const copyTemplatesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Write the copy or remove this template.")
      .max(MAX_COPY_LENGTH, `Keep copy to ${MAX_COPY_LENGTH.toLocaleString("en-US")} characters or fewer.`)
      .refine((v) => tokensIn(v).every((t) => copyTokenSet.has(t)), {
        message: `Only these tokens are replaced: ${copyTokens.map((t) => `{{${t.token}}}`).join(", ")}.`,
      }),
  )
  .max(MAX_COPY_TEMPLATES, `Use at most ${MAX_COPY_TEMPLATES} templates.`);

export type CopyValues = Partial<Record<CopyToken, string | null>>;

export interface FilledCopy {
  text: string;
  /** Tokens that had no value for this post (removed from the text). */
  missing: CopyToken[];
}

/** Replaces copy tokens; unknown tokens are left as written so validation can flag them. */
export function fillCopyTemplate(template: string, values: CopyValues): FilledCopy {
  const missing = new Set<CopyToken>();
  const text = template
    .replace(TOKEN_RE, (whole, name: string) => {
      if (!copyTokenSet.has(name)) return whole;
      const value = values[name as CopyToken];
      if (value === null || value === undefined || value === "") {
        missing.add(name as CopyToken);
        return "";
      }
      return value;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { text, missing: [...missing] };
}

export const copyExampleValues: CopyValues = Object.fromEntries(copyTokens.map((t) => [t.token, t.example]));
