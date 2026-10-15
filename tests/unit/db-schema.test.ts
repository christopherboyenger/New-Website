import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../support/db";

describe("database schema", () => {
  it("applies the full code schema to an empty Postgres database", async () => {
    const db = await createTestDb();
    const result = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const rows = (result as unknown as { rows: { table_name: string }[] }).rows;
    const names = rows.map((r) => r.table_name);
    expect(names).toContain("organizations");
    expect(names).toContain("ledger_entries");
    expect(names).toContain("posts");
  });
});
