import "server-only";
import { newId } from "@/lib/ids";
import { getDb, type DbLike } from "./db/client";
import { auditLog } from "./db/schema";

export interface AuditEvent {
  orgId: string | null;
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  /** Never include secrets, tokens or credential contents. */
  data?: Record<string, unknown>;
}

export async function recordAudit(event: AuditEvent, tx?: DbLike): Promise<void> {
  const db = tx ?? (await getDb());
  await db.insert(auditLog).values({
    id: newId("aud"),
    orgId: event.orgId,
    actorUserId: event.actorUserId,
    action: event.action,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    data: event.data ?? {},
  });
}
