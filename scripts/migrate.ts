import "./env";
import { readFile } from "node:fs/promises";
import { transaction, pool } from "../src/lib/db";
async function main() {
  await transaction(async (db) => {
    await db.query(
      "CREATE TABLE IF NOT EXISTS leyona_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    if (
      !(
        await db.query(
          "SELECT 1 FROM leyona_migrations WHERE name='001_initial'",
        )
      ).rowCount
    ) {
      await db.query(await readFile("migrations/001_initial.sql", "utf8"));
      await db.query(
        "INSERT INTO leyona_migrations(name) VALUES('001_initial')",
      );
    }
  });
  console.log("Migrations are current.");
}
main()
  .catch((e) => {
    console.error("Migration failed:", e.code ?? e.message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
