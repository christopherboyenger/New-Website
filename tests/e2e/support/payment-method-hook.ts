/**
 * TEST-ONLY database helper for the Playwright suite. It stands in for the
 * one thing the end-to-end environment cannot do: a card confirmed by the
 * payment provider (Stripe Checkout + webhook). It records the workspace's
 * payment method as provider-confirmed so the real publish/activate commands
 * can be exercised through the UI.
 *
 * Reachable only through src/app/api/e2e/payment-method/route.e2e.ts, which
 * is a route only when the dev server runs with E2E_TEST_HOOKS=1 (see
 * next.config.ts `pageExtensions`). It refuses to run in production or
 * against a real database, and only for an owner of the workspace who is
 * signed in on the request.
 */
import "server-only";
import { getDb } from "@/server/db/client";
import { billingAccounts } from "@/server/db/schema";
import { env } from "@/server/env";
import { ForbiddenError, NotFoundError, requireOrgAction } from "@/server/authz";

export function e2eHooksEnabled(): boolean {
  return process.env.E2E_TEST_HOOKS === "1" && env().NODE_ENV !== "production" && !env().DATABASE_URL;
}

export async function markPaymentMethodReadyForTests(request: Request): Promise<Response> {
  if (!e2eHooksEnabled()) return new Response("Not found", { status: 404 });
  const body = (await request.json().catch(() => null)) as { org?: unknown } | null;
  const slug = typeof body?.org === "string" ? body.org : "";
  if (!slug) return Response.json({ error: "org is required" }, { status: 400 });

  let orgId: string;
  try {
    orgId = (await requireOrgAction(slug, "billing:manage")).org.id;
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
    if (error instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw error;
  }

  const db = await getDb();
  const ready = { paymentMethodStatus: "ready" as const, paymentMethodBrand: "e2e-test-card", paymentMethodLast4: "0000", updatedAt: new Date() };
  await db
    .insert(billingAccounts)
    .values({ orgId, ...ready })
    .onConflictDoUpdate({ target: billingAccounts.orgId, set: ready });
  return Response.json({ ok: true });
}
