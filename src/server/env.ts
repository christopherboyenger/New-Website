import "server-only";
import { z } from "zod";

/**
 * Server-only environment. Every provider is optional: a missing credential
 * leaves that capability in a "not configured" readiness state instead of
 * failing the whole app (docs/spec/production-requirements.md §5).
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /** Postgres connection string. When absent outside production, an embedded PGlite database is used. */
  DATABASE_URL: z.string().url().optional(),
  PGLITE_DIR: z.string().optional(),
  /** 32-byte base64 key for envelope-encrypting tenant credentials. Required to accept provider secrets. */
  CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
  /** Secret used to key token digests (sessions, API grants, invitations). */
  AUTH_SECRET: z.string().min(32).optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_UNLIMITED_PRICE_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  TIKTOK_BUSINESS_APP_ID: z.string().optional(),
  TIKTOK_BUSINESS_APP_SECRET: z.string().optional(),
  GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  /** Comma-separated emails allowed to use the operator console. */
  OPERATOR_EMAILS: z.string().optional(),
  /** Allows development-only conveniences (email outbox viewer) outside NODE_ENV=development. Never set in production. */
  ENABLE_DEV_TOOLS: z.enum(["true", "false"]).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}

export function devToolsEnabled(): boolean {
  return env().NODE_ENV === "development" || env().ENABLE_DEV_TOOLS === "true";
}

/** Secret for keyed digests. Development falls back to a fixed local value; production must configure AUTH_SECRET. */
export function authSecret(): string {
  const value = env().AUTH_SECRET;
  if (value) return value;
  if (isProduction()) {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return "development-only-auth-secret-change-me-0123456789";
}

export function operatorEmails(): Set<string> {
  return new Set(
    (env().OPERATOR_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Test hook: reset parsed env after mutating process.env. */
export function resetEnvForTesting(): void {
  cached = null;
}
