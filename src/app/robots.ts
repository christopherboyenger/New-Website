import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/home", "/auth", "/onboarding", "/api", "/dev", "/invitations", "/start"],
    },
    sitemap: new URL("/sitemap.xml", site.appUrl).toString(),
  };
}
