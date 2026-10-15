import { expect, type Page } from "@playwright/test";

/**
 * TEST-ONLY. Records the workspace's payment method as provider-confirmed,
 * standing in for Stripe Checkout + webhook, which the end-to-end environment
 * has no credentials for. Calls the test-only route served only by the e2e
 * dev server (E2E_TEST_HOOKS=1, see payment-method-hook.ts), as the signed-in
 * owner in `page`'s browser context.
 */
export async function markPaymentMethodReady(page: Page, slug: string): Promise<void> {
  const response = await page.request.post("/api/e2e/payment-method", { data: { org: slug } });
  expect(response.status(), "test-only payment hook (is the server running with E2E_TEST_HOOKS=1?)").toBe(200);
}
