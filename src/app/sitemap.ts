import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/** Public marketing pages only; app, auth and onboarding routes are excluded (see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1 },
    { path: "/pricing", priority: 0.8 },
    { path: "/how-it-works", priority: 0.7 },
    { path: "/creators", priority: 0.6 },
  ];
  return pages.map(({ path, priority }) => ({
    url: new URL(path, site.appUrl).toString(),
    changeFrequency: "monthly",
    priority,
  }));
}
