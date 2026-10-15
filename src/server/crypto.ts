import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authSecret, env } from "./env";

/** 32 random bytes, base64url — used for session, invitation, OAuth state and API tokens. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Keyed digest of a secret token. Only digests are stored, so a database
 * leak does not reveal usable tokens.
 */
export function tokenDigest(token: string, purpose: string): string {
  return createHmac("sha256", authSecret()).update(`${purpose}:${token}`).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export class CredentialEncryptionUnavailableError extends Error {
  constructor() {
    super("CREDENTIALS_ENCRYPTION_KEY is not configured; provider secrets cannot be stored.");
    this.name = "CredentialEncryptionUnavailableError";
  }
}

function encryptionKey(): Buffer | null {
  const raw = env().CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export function credentialEncryptionConfigured(): boolean {
  return encryptionKey() !== null;
}

export interface SealedSecret {
  /** Key version, for rotation/rewrap. */
  v: 1;
  iv: string;
  tag: string;
  ct: string;
}

/**
 * AES-256-GCM with associated data binding the ciphertext to its owner
 * (e.g. `org_x:int_y:meta_ads:3`), so a sealed value copied to another row
 * fails to decrypt. A managed KMS can replace the local key later.
 */
export function sealSecret(plaintext: string, associatedData: string): SealedSecret {
  const key = encryptionKey();
  if (!key) throw new CredentialEncryptionUnavailableError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(associatedData));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

export function openSecret(sealed: SealedSecret, associatedData: string): string {
  const key = encryptionKey();
  if (!key) throw new CredentialEncryptionUnavailableError();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
  decipher.setAAD(Buffer.from(associatedData));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ct, "base64")), decipher.final()]).toString("utf8");
}
