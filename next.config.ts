import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Request-time rendering everywhere: every workspace page depends on the
  // signed-in session and tenant data, so Cache Components is left off.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Lets parallel local dev servers use separate build folders (NEXT_DIST_DIR=.next-<name>).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // `*.e2e.ts` files are test-only route handlers for the Playwright suite
  // (playwright.config.ts sets E2E_TEST_HOOKS=1 on a development server). In
  // every other build they are not routes at all and are never compiled.
  pageExtensions: process.env.E2E_TEST_HOOKS === "1" && process.env.NODE_ENV !== "production" ? ["e2e.ts", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
