import { handleStripeWebhook, MAX_WEBHOOK_BYTES } from "@/server/billing/webhooks";

/**
 * POST /api/webhooks/stripe — Stripe event delivery for brand billing.
 * Signature verification needs the exact raw body, so it is read as text
 * (bounded) and handed to the billing webhook processor unparsed.
 */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return Response.json({ error: "Payload too large." }, { status: 413 });
  const rawBody = await request.text();
  const result = await handleStripeWebhook(rawBody, request.headers.get("stripe-signature"));
  return Response.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
}
