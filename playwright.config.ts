import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end journeys (tests/e2e) against a real `next dev` server with its
 * own throwaway embedded database (.data/pglite-e2e, recreated per run) and
 * build folder (.next-e2e), so it never touches your development data.
 *
 *   npm run test:e2e
 *
 * The server also enables the test-only hooks in tests/e2e/support (see
 * E2E_TEST_HOOKS in next.config.ts); they are not routes in any other build.
 */
const PORT = Number(process.env.E2E_PORT ?? 3124);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Journeys share one dev server and database; each creates its own users and workspaces.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The journeys assert the honest states of a deployment without provider credentials
    // (email not delivered, card payments not configured), so those are removed from the server's environment (DATABASE_URL too, so db:push only ever targets the throwaway PGlite folder).
    command: [
      "unset DATABASE_URL RESEND_API_KEY EMAIL_FROM STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET",
      `node -e "require('node:fs').rmSync('.data/pglite-e2e',{recursive:true,force:true})"`,
      "npm run db:push",
      `npx next dev -p ${PORT}`,
    ].join(" && "),
    url: `${baseURL}/auth/sign-in`,
    timeout: 240_000,
    // E2E_REUSE_SERVER=1 reuses a server you started yourself with the same env (handy while writing tests).
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    stdout: "ignore",
    stderr: "pipe",
    env: {
      PGLITE_DIR: ".data/pglite-e2e",
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_APP_URL: baseURL,
      E2E_TEST_HOOKS: "1",
    },
  },
});
