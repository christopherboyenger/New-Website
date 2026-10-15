import "server-only";
import type { SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
/** A transaction handle; accepted anywhere a Db is, so helpers compose inside transactions. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured. Provision a Postgres database and set DATABASE_URL.");
    this.name = "DatabaseNotConfiguredError";
  }
}

type GlobalWithDb = typeof globalThis & { __appDb?: Promise<Db> };
const globalForDb = globalThis as GlobalWithDb;

/**
 * Database access.
 * - DATABASE_URL set → Postgres (production path; schema applied by `npm run db:migrate`).
 * - Otherwise, outside production → embedded PGlite under `.data/`, whose schema
 *   is synced by `npm run db:push` (development convenience only).
 */
export function getDb(): Promise<Db> {
  if (!globalForDb.__appDb) {
    globalForDb.__appDb = createDb().catch((error) => {
      globalForDb.__appDb = undefined;
      throw error;
    });
  }
  return globalForDb.__appDb;
}

async function createDb(): Promise<Db> {
  const { DATABASE_URL, NODE_ENV, PGLITE_DIR } = env();
  if (DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(DATABASE_URL, { max: 5, prepare: false });
    return drizzle({ client, schema }) as unknown as Db;
  }
  if (NODE_ENV === "production") throw new DatabaseNotConfiguredError();

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { mkdir } = await import("node:fs/promises");
  const { dirname, resolve } = await import("node:path");
  const dataDir = resolve(/*turbopackIgnore: true*/ PGLITE_DIR ?? ".data/pglite");
  await mkdir(dirname(dataDir), { recursive: true });
  const client = new PGlite(dataDir);
  const { rows } = await client.query<{ present: boolean }>("select to_regclass('public.organizations') is not null as present");
  if (!rows[0]?.present) {
    throw new Error("The development database has no schema. Run `npm run db:push` (it also runs automatically before `npm run dev`).");
  }
  return drizzle({ client, schema }) as unknown as Db;
}

/** Raw SQL returning rows, normalized across the PGlite (`{ rows }`) and postgres-js (array) drivers. */
export async function executeRows<T extends Record<string, unknown>>(db: DbLike, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/** Test hook: route getDb() to an isolated database. */
export function setDbForTesting(db: Db | null): void {
  globalForDb.__appDb = db ? Promise.resolve(db) : undefined;
}
