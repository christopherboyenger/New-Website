/**
 * TEST-ONLY route for the Playwright suite. Because of its `.e2e.ts`
 * extension it is a route only on a development server started with
 * E2E_TEST_HOOKS=1 (next.config.ts `pageExtensions`); every other build
 * ignores this file. See tests/e2e/support/payment-method-hook.ts.
 */
import { markPaymentMethodReadyForTests } from "../../../../../tests/e2e/support/payment-method-hook";

export const POST = markPaymentMethodReadyForTests;
