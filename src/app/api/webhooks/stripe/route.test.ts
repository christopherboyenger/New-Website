import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { createTestDb } from "../../../../../tests/support/db";
import { getDb } from "@/server/db/client";
import { webhookInbox } from "@/server/db/schema";
import { resetEnvForTesting } from "@/server/env";
import { POST } from "./route";

const SECRET = "whsec_route_test";

function post(body: string, signature?: string) {
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body,
      headers: signature ? { "stripe-signature": signature, "content-type": "application/json" } : { "content-type": "application/json" },
    }),
  );
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(async () => {
    await createTestDb();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    resetEnvForTesting();
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    resetEnvForTesting();
  });

  it("verifies the signature over the exact raw body", async () => {
    const body = JSON.stringify({ id: "evt_route_1", object: "event", type: "customer.created", livemode: false, created: 1, data: { object: { id: "cus_1" } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });

    const tampered = await post(body.replace("cus_1", "cus_2"), header);
    expect(tampered.status).toBe(400);
    const unsigned = await post(body);
    expect(unsigned.status).toBe(400);
    const db = await getDb();
    expect(await db.select().from(webhookInbox)).toHaveLength(0);

    const valid = await post(body, header);
    expect(valid.status).toBe(200);
    expect(await db.select().from(webhookInbox)).toHaveLength(1);
  });
});
