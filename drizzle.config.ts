import { defineConfig } from "drizzle-kit";

/**
 * - DATABASE_URL set → real Postgres (generate migrations, `npm run db:migrate`).
 * - Otherwise → the embedded development database (PGlite) under .data/,
 *   synced by `npm run db:push` (runs automatically before `npm run dev`).
 */
const url = process.env.DATABASE_URL;

export default url
  ? defineConfig({
      dialect: "postgresql",
      schema: "./src/server/db/schema/index.ts",
      out: "./drizzle",
      dbCredentials: { url },
    })
  : defineConfig({
      dialect: "postgresql",
      driver: "pglite",
      schema: "./src/server/db/schema/index.ts",
      out: "./drizzle",
      dbCredentials: { url: process.env.PGLITE_DIR ?? ".data/pglite" },
    });
