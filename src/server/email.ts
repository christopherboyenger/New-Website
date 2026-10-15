import "server-only";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { site } from "@/config/site";
import { getDb } from "./db/client";
import { emailOutbox } from "./db/schema";
import { devToolsEnabled, env, isProduction } from "./env";

export interface OutgoingEmail {
  to: string;
  template: "verify_email" | "reset_password" | "invitation" | "lead_received";
  subject: string;
  /** Plain-text body; may contain one-time links, so it is never logged. */
  body: string;
}

export type EmailDeliveryStatus = "sent" | "failed" | "provider_unconfigured";

/**
 * Removes one-time credentials (verification/reset `token=` values and
 * invitation link tokens) from a message body. Only digests of those tokens
 * are stored by the auth and invitation code; the outbox must not keep a
 * usable copy either, or anyone who can read the table could take over
 * accounts or accept invitations.
 */
export function redactOneTimeLinks(body: string): string {
  return body.replace(/([?&]token=)[^\s&#]+/g, "$1[redacted]").replace(/(\/invitations\/)[^\s/?#]+/g, "$1[redacted]");
}

/** Production keeps only a redacted copy; development/test keep the full body so /dev/outbox and tests can follow links. */
function outboxBody(body: string): string {
  return isProduction() && !devToolsEnabled() ? redactOneTimeLinks(body) : body;
}

export function emailProviderConfigured(): boolean {
  return Boolean(env().RESEND_API_KEY && env().EMAIL_FROM);
}

/**
 * Records the message in the outbox (one-time links redacted in production)
 * and delivers it through the configured provider. Without a provider the message stays `provider_unconfigured` —
 * callers must surface that state honestly (no "email sent" claims). In
 * development the outbox can be read at /dev/outbox.
 */
export async function sendEmail(message: OutgoingEmail): Promise<{ id: string; status: EmailDeliveryStatus }> {
  const db = await getDb();
  const id = newId("eml");
  const configured = emailProviderConfigured();
  await db.insert(emailOutbox).values({
    id,
    toEmail: message.to,
    template: message.template,
    subject: message.subject,
    body: outboxBody(message.body),
    status: configured ? "queued" : "provider_unconfigured",
  });
  if (!configured) return { id, status: "provider_unconfigured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env().RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": id,
      },
      body: JSON.stringify({ from: env().EMAIL_FROM, to: [message.to], subject: message.subject, text: message.body }),
    });
    if (!response.ok) {
      const error = `provider_http_${response.status}`;
      await db.update(emailOutbox).set({ status: "failed", error }).where(eq(emailOutbox.id, id));
      return { id, status: "failed" };
    }
    const json = (await response.json()) as { id?: string };
    await db
      .update(emailOutbox)
      .set({ status: "sent", providerMessageId: json.id ?? null, sentAt: new Date() })
      .where(eq(emailOutbox.id, id));
    return { id, status: "sent" };
  } catch {
    await db.update(emailOutbox).set({ status: "failed", error: "network_error" }).where(eq(emailOutbox.id, id));
    return { id, status: "failed" };
  }
}

export function absoluteUrl(path: string): string {
  return new URL(path, site.appUrl).toString();
}
