import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
const globalDb = globalThis as unknown as { leyonaPool?: Pool };
export function pool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  if (!globalDb.leyonaPool) {
    globalDb.leyonaPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 12,
      connectionTimeoutMillis: 3000,
    });
    globalDb.leyonaPool.on("error", (error: Error & { code?: string }) =>
      console.error(
        "PostgreSQL idle connection unavailable:",
        error.code ?? "CONNECTION_ERROR",
      ),
    );
  }
  return globalDb.leyonaPool;
}
export function database() {
  return drizzle(pool());
}
export async function transaction<T>(
  run: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool().connect();
  try {
    await db.query("BEGIN");
    // Deliberately serialize write commands for the 5–50 tester launch.
    // This includes worker mutations, admin operations and combo commands.
    await db.query("SELECT pg_advisory_xact_lock(19661111)");
    const result = await run(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
