import "server-only";
import { z } from "zod";
import { fail, fromZodError, ok, runAction, type ActionResult } from "../action-result";
import { recordAudit } from "../audit";
import { getDb } from "../db/client";
import { env } from "../env";
import { requireSensitiveAction } from "./guards";
import { beginGeneration } from "./installations";

/**
 * Google Play reports: no customer secret. The customer invites THIS product's
 * service account in Play Console and gives the package name and the report
 * bucket ID. Verification needs this product's Google Cloud credentials to
 * read the bucket; until a verification run succeeds the installation stays
 * `verifying` (shown as "Awaiting verification"), never `connected`.
 */

export function googlePlayServiceAccountEmail(): string | null {
  return env().GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL?.trim() || null;
}

/** Accepts the bare bucket ID or the copied Cloud Storage URI (gs://pubsite_prod_…/stats/…). */
export function normalizeBucketId(value: string): string {
  return value
    .trim()
    .replace(/^gs:\/\//i, "")
    .split("/")[0];
}

export const googlePlaySchema = z.object({
  packageName: z
    .string()
    .trim()
    .max(150, "Package names are at most 150 characters.")
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/, "Enter the app's package name, like com.example.app."),
  bucketId: z
    .string()
    .transform(normalizeBucketId)
    .pipe(z.string().regex(/^pubsite_prod_[a-z0-9_]{4,64}$/, "Enter the bucket ID starting with pubsite_prod_ (from Download reports).")),
});

export async function connectGooglePlay(slug: string, input: unknown): Promise<ActionResult<{ status: "verifying" }>> {
  return runAction(async () => {
    const gate = await requireSensitiveAction(slug, "integrations:manage");
    if (!gate.ok) return gate.result;
    const { ctx } = gate;
    if (!googlePlayServiceAccountEmail()) {
      return fail("This product's Google Play reporting identity isn't configured.", "not_configured");
    }
    const parsed = googlePlaySchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { packageName, bucketId } = parsed.data;

    const db = await getDb();
    await db.transaction(async (tx) => {
      const row = await beginGeneration(tx, ctx.org.id, "google_play", {
        status: "verifying",
        connectedByUserId: ctx.user.id,
        publicConfig: { packageName, bucketId },
      });
      await recordAudit(
        { orgId: ctx.org.id, actorUserId: ctx.user.id, action: "integration.configure", targetType: "integration", targetId: row.id, data: { provider: "google_play", packageName } },
        tx,
      );
    });
    return ok({ status: "verifying" as const }, "Saved. Verification is pending.");
  });
}
