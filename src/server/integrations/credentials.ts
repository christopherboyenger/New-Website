import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { openSecret, sealSecret, type SealedSecret } from "../crypto";
import { getDb, type DbLike } from "../db/client";
import { credentialVersions, type IntegrationProvider } from "../db/schema";

/**
 * Tenant credential custody (DEC-016). Secrets are sealed with AES-256-GCM and
 * associated data binding them to org / installation / provider / generation,
 * so a sealed value copied to another row, org or generation fails to open.
 * Nothing in this module returns plaintext to callers outside the server.
 */

export interface CredentialOwner {
  orgId: string;
  installationId: string;
  provider: IntegrationProvider;
  generation: number;
}

export function credentialAssociatedData(owner: CredentialOwner): string {
  return `${owner.orgId}:${owner.installationId}:${owner.provider}:${owner.generation}`;
}

export function sealCredential(owner: CredentialOwner, payload: Record<string, unknown>): SealedSecret {
  return sealSecret(JSON.stringify(payload), credentialAssociatedData(owner));
}

/** Throws when the ciphertext is not bound to `owner` (wrong org/installation/provider/generation) or was tampered with. */
export function openCredential<T>(owner: CredentialOwner, sealed: SealedSecret): T {
  return JSON.parse(openSecret(sealed, credentialAssociatedData(owner))) as T;
}

/** Stores a sealed credential for the given generation, destroying any older live versions. */
export async function storeCredential(
  tx: DbLike,
  owner: CredentialOwner,
  payload: Record<string, unknown>,
  expiresAt: Date | null = null,
): Promise<void> {
  const sealed = sealCredential(owner, payload);
  await destroyCredentials(tx, owner.orgId, owner.installationId);
  await tx.insert(credentialVersions).values({
    id: newId("crd"),
    installationId: owner.installationId,
    orgId: owner.orgId,
    generation: owner.generation,
    sealed,
    expiresAt,
  });
}

/** Marks every live credential version of an installation destroyed (ciphertext is also wiped). */
export async function destroyCredentials(tx: DbLike, orgId: string, installationId: string): Promise<number> {
  const rows = await tx
    .update(credentialVersions)
    .set({ destroyedAt: new Date(), sealed: { v: 1, iv: "", tag: "", ct: "" } })
    .where(and(eq(credentialVersions.orgId, orgId), eq(credentialVersions.installationId, installationId), isNull(credentialVersions.destroyedAt)))
    .returning({ id: credentialVersions.id });
  return rows.length;
}

/** Opens the live credential of the installation's current generation, or null if none is stored. */
export async function loadCurrentCredential<T>(owner: CredentialOwner): Promise<T | null> {
  const db = await getDb();
  const [row] = await db
    .select({ sealed: credentialVersions.sealed })
    .from(credentialVersions)
    .where(
      and(
        eq(credentialVersions.orgId, owner.orgId),
        eq(credentialVersions.installationId, owner.installationId),
        eq(credentialVersions.generation, owner.generation),
        isNull(credentialVersions.destroyedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  return openCredential<T>(owner, row.sealed);
}
