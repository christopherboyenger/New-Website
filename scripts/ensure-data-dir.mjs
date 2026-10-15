// Creates the parent directory for the embedded development database.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

if (!process.env.DATABASE_URL) {
  mkdirSync(dirname(resolve(process.env.PGLITE_DIR ?? ".data/pglite")), { recursive: true });
}
