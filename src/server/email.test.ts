import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/support/db";
import { getDb } from "./db/client";
import { emailOutbox } from "./db/schema";
import { redactOneTimeLinks, sendEmail } from "./email";
import { resetEnvForTesting } from "./env";

describe("email outbox secrets", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTesting();
  });

  it("redacts verification/reset tokens and invitation link tokens", () => {
    const body = [
      "Verify: https://app.example/auth/verify?token=abc_DEF-123",
      "Reset: https://app.example/auth/reset?token=x%2By&utm=1",
      "Join: https://app.example/invitations/inv_tok-123",
      "Keep: https://app.example/home/acme",
    ].join("\n");
    const out = redactOneTimeLinks(body);
    expect(out).not.toContain("abc_DEF-123");
    expect(out).not.toContain("x%2By");
    expect(out).not.toContain("inv_tok-123");
    expect(out).toContain("verify?token=[redacted]");
    expect(out).toContain("/invitations/[redacted]");
    expect(out).toContain("https://app.example/home/acme");
  });

  it("stores only a redacted body in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_TOOLS", "false");
    vi.stubEnv("RESEND_API_KEY", "");
    resetEnvForTesting();
    await sendEmail({ to: "a@example.com", template: "reset_password", subject: "Reset", body: "Open https://app.example/auth/reset?token=SECRET123 now" });
    const [row] = await (await getDb()).select().from(emailOutbox);
    expect(row.body).not.toContain("SECRET123");
    expect(row.body).toContain("token=[redacted]");
  });
});
