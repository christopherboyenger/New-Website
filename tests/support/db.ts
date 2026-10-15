import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "@/server/db/schema";
import { setDbForTesting, type Db } from "@/server/db/client";

let instance: Promise<{ client: PGlite; db: Db; tables: string[] }> | null = null;

async function boot() {
  const client = new PGlite();
  const ddl = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema as unknown as Record<string, unknown>));
  for (const statement of ddl) await client.exec(statement);
  const tables = (
    await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'")
  ).rows.map((r) => `"${r.tablename}"`);
  const db = drizzle({ client, schema }) as unknown as Db;
  return { client, db, tables };
}

/**
 * In-memory Postgres (PGlite) with the current code schema, installed as the
 * database returned by getDb(). Booted once per test worker; every call wipes
 * all rows, so each test starts from an empty database. Call in `beforeEach`.
 */
export async function createTestDb(): Promise<Db> {
  instance ??= boot();
  const { client, db, tables } = await instance;
  if (tables.length) await client.exec(`truncate ${tables.join(", ")} restart identity cascade`);
  setDbForTesting(db);
  return db;
}
