import "./env";
import { Client } from "pg";
const source = process.env.DATABASE_URL;
if (!source) throw new Error("Add DATABASE_URL to .env.local first.");
const url = new URL(source),
  name = url.pathname.slice(1);
if (name !== "leyona")
  throw new Error("This bootstrap only creates the dedicated leyona database.");
url.pathname = "/postgres";
const db = new Client({
  connectionString: url.toString(),
  connectionTimeoutMillis: 5000,
});
try {
  await db.connect();
  if (
    !(await db.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
      .rowCount
  )
    await db.query('CREATE DATABASE "leyona"');
  console.log("Leyona database is ready.");
} catch (error) {
  console.error(
    "Database setup failed:",
    (error as { code?: string }).code ?? "CONNECTION_ERROR",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
