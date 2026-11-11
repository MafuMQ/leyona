import "./env";
import { PgBoss } from "pg-boss";
import { transaction, pool } from "../src/lib/db";
import { cancelOrder, executeOrder, placeOrder } from "../src/lib/exchange";
import { balance, cash, shares } from "../src/lib/ledger";
import { finalize } from "../src/lib/resolution";
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });
boss.on("error", (error: Error & { code?: string }) =>
  console.error("Worker database error:", error.code ?? "WORKER_ERROR"),
);
async function tick() {
  await transaction(async (db) => {
    for (const o of (
      await db.query(
        "SELECT id FROM orders WHERE state IN ('open','pending') AND expires_at<=now()",
      )
    ).rows)
      await cancelOrder(db, o.id);
    const live = (
      await db.query(
        "SELECT id,score FROM markets WHERE live AND status='open' AND closes_at>now()",
      )
    ).rows;
    for (const m of live) {
      const row = (
        await db.query(
          "INSERT INTO simulator_state(market_id,tick) VALUES($1,1) ON CONFLICT(market_id) DO UPDATE SET tick=simulator_state.tick+1 RETURNING tick",
          [m.id],
        )
      ).rows[0];
      const tick = row.tick;
      const score =
        m.id === "city-arsenal"
          ? `MCI ${1 + Math.floor(tick / 50)} – ${Math.floor(tick / 70)} ARS · ${34 + (tick % 57)}′`
          : m.id === "lakers-celtics"
            ? `LAL ${62 + (tick % 40)} – ${68 + (tick % 35)} BOS · Q${3 + (Math.floor(tick / 30) % 2)}`
            : `Simulation · tick ${tick}`;
      await db.query(
        "UPDATE markets SET score=$2,updated_at=now() WHERE id=$1",
        [m.id, score],
      );
    }
    for (const o of (
      await db.query(
        "SELECT o.id,m.status,m.closes_at FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.state IN ('pending','open') ORDER BY o.priority",
      )
    ).rows) {
      if (
        o.status !== "open" ||
        new Date(o.closes_at).getTime() <= Date.now()
      ) {
        await cancelOrder(db, o.id);
        continue;
      }
    }
    for (const o of (
      await db.query(
        "SELECT id FROM orders WHERE state='pending' AND eligible_at<=now() ORDER BY priority",
      )
    ).rows)
      await executeOrder(db, o.id);
    const bot = (
      await db.query(
        "SELECT id FROM users WHERE role='bot' ORDER BY created_at LIMIT 1",
      )
    ).rows[0];
    if (bot)
      for (const m of (
        await db.query(
          "SELECT * FROM markets WHERE status='open' AND closes_at>now()",
        )
      ).rows) {
        for (const outcome of ["yes", "no"] as const)
          for (const side of ["buy", "sell"] as const) {
            const existing = await db.query(
              "SELECT 1 FROM orders WHERE user_id=$1 AND market_id=$2 AND outcome=$3 AND side=$4 AND state IN ('open','pending')",
              [bot.id, m.id, outcome, side],
            );
            if (existing.rowCount) continue;
            const fair = outcome === "yes" ? m.yes_price : 10000 - m.yes_price,
              price = Math.max(
                1,
                Math.min(9999, fair + (side === "buy" ? -150 : 150)),
              ),
              quantity = 100;
            if (
              (await balance(
                db,
                side === "buy" ? cash(bot.id) : shares(bot.id, m.id, outcome),
              )) < BigInt(side === "buy" ? price * quantity : quantity)
            )
              continue;
            await placeOrder(db, bot.id, {
              marketId: m.id,
              outcome,
              side,
              price,
              quantity,
              tif: "GTC",
            });
          }
      }
    for (const m of (
      await db.query(
        "SELECT id FROM markets WHERE status='proposed' AND challenge_until<=now()",
      )
    ).rows)
      await finalize(db, m.id);
    await db.query("DELETE FROM sessions WHERE expires_at<now()");
  });
}
async function main() {
  await boss.start();
  await boss.createQueue("simulation-tick");
  await boss.work("simulation-tick", async () => {
    await tick();
  });
  const enqueue = () =>
    boss
      .send(
        "simulation-tick",
        {},
        {
          singletonKey: "live",
          singletonSeconds: 2,
          retryLimit: 3,
          retryDelay: 2,
        },
      )
      .catch((e) => console.error("Queue error", e.code ?? "unknown"));
  const timer = setInterval(enqueue, 2000);
  await enqueue();
  console.log(
    "Leyona worker running: simulator, order eligibility, bots and settlement.",
  );
  const stop = async () => {
    clearInterval(timer);
    await boss.stop();
    await pool().end();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
main().catch((e) => {
  console.error("Worker failed:", e.code ?? e.message);
  process.exit(1);
});
