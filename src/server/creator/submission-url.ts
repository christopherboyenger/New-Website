import "server-only";
import type { Platform } from "@/domain/campaign";
import { platformLabels } from "@/domain/campaign";

/**
 * Submitted post URLs: https only, on the platform's own hosts, without
 * credentials or ports. Normalized so the same post cannot be submitted twice
 * under trivially different URLs (fragment, tracking query, trailing slash,
 * host case). YouTube keeps its `v` video parameter; other platforms keep no
 * query at all, and `m.`/bare hosts are stored as the `www.` host.
 */

export const platformHosts: Record<Platform, readonly string[]> = {
  tiktok: ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  instagram: ["instagram.com", "www.instagram.com"],
  snapchat: ["snapchat.com", "www.snapchat.com", "story.snapchat.com"],
  facebook_reels: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"],
};

/** Bare, `www.` and `m.` hosts serve the same post; they are stored as the `www.` form. Short-link hosts are kept. */
function canonicalHost(host: string): string {
  const bare = host.replace(/^(www|m)\./, "");
  return ["tiktok.com", "youtube.com", "instagram.com", "snapchat.com", "facebook.com"].includes(bare) ? `www.${bare}` : host;
}

export const MAX_POST_URL_LENGTH = 500;

export type PostUrlCheck = { ok: true; url: string } | { ok: false; error: string };

export function normalizePostUrl(platform: Platform, input: string): PostUrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Paste the link to your post." };
  if (raw.length > MAX_POST_URL_LENGTH) return { ok: false, error: "That link is too long." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Paste the full link, starting with https://." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Use a secure link that starts with https://." };
  if (url.username || url.password || url.port) return { ok: false, error: `Use the post's normal ${platformLabels[platform]} link.` };
  const host = url.hostname.toLowerCase();
  if (!platformHosts[platform].includes(host)) return { ok: false, error: `That isn't a ${platformLabels[platform]} link.` };
  const path = url.pathname.replace(/\/+$/, "");
  if (!path && !(platform === "youtube" && url.searchParams.get("v"))) return { ok: false, error: "Paste the link to the post itself, not the site's home page." };
  let query = "";
  if (platform === "youtube") {
    const v = url.searchParams.get("v");
    if (v) query = `?v=${encodeURIComponent(v)}`;
  }
  return { ok: true, url: `https://${canonicalHost(host)}${path}${query}` };
}
