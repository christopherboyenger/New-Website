/**
 * Applies generated SQL migrations from ./drizzle to DATABASE_URL.
 * Production schema changes go through `npm run db:generate` + review + this script.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
try {
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} finally {
  await client.end();
}
