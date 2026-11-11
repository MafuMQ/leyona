import "./env";
import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import { transaction, pool } from "../src/lib/db";
import { fixtures } from "../src/lib/fixtures";
import {
  account,
  addCost,
  balance,
  cash,
  ensureShares,
  ensureUser,
  post,
  shares,
} from "../src/lib/ledger";
import { placeOrder } from "../src/lib/exchange";
async function main() {
  await transaction(async (db) => {
    let bot = (
      await db.query("SELECT id FROM users WHERE email='maker@leyona.local'")
    ).rows[0];
    if (!bot)
      bot = (
        await db.query(
          "INSERT INTO users(email,name,password_hash,role) VALUES('maker@leyona.local','Leyona simulation maker','disabled','bot') RETURNING id",
        )
      ).rows[0];
    await ensureUser(db, bot.id);
    await account(db, "system:issuance", null, "credit", true);
    if (
      !(
        await db.query(
          "SELECT 1 FROM journal WHERE reference='seed:bot-funding'",
        )
      ).rowCount
    )
      await post(
        db,
        "bot-funding",
        "seed:bot-funding",
        "Simulation maker funding",
        [
          ["system:issuance", -10_000_000n * 10000n],
          [cash(bot.id), 10_000_000n * 10000n],
        ],
      );
    for (const m of fixtures) {
      const inserted = await db.query(
        "INSERT INTO markets(id,question,description,category,icon,yes_price,closes_at,live,score,event_group) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id",
        [
          m.id,
          m.question,
          m.description,
          m.category,
          m.icon,
          m.yes_price,
          m.closes_at,
          m.live,
          m.score,
          m.event_group,
        ],
      );
      if (!inserted.rowCount) continue;
      const q = 10000n,
        collateral = await account(db, `collateral:${m.id}`);
      for (const outcome of ["yes", "no"])
        await ensureShares(db, bot.id, m.id, outcome);
      await post(
        db,
        "split",
        `seed:split:${m.id}`,
        "Simulation maker creates backed shares",
        [
          [cash(bot.id), -q * 10000n],
          [collateral, q * 10000n],
          [`supply:${m.id}:yes`, -q],
          [shares(bot.id, m.id, "yes"), q],
          [`supply:${m.id}:no`, -q],
          [shares(bot.id, m.id, "no"), q],
        ],
      );
      await addCost(db, bot.id, m.id, "yes", q * BigInt(m.yes_price));
      await addCost(db, bot.id, m.id, "no", q * BigInt(10000 - m.yes_price));
      for (const outcome of ["yes", "no"] as const) {
        const fair = outcome === "yes" ? m.yes_price : 10000 - m.yes_price;
        for (const side of ["buy", "sell"] as const)
          await placeOrder(db, bot.id, {
            marketId: m.id,
            outcome,
            side,
            price: side === "buy" ? fair - 150 : fair + 150,
            quantity: 500,
            tif: "GTC",
          });
      }
    }
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      if (process.env.ADMIN_PASSWORD.length < 12)
        throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
      const email = process.env.ADMIN_EMAIL.toLowerCase(),
        salt = randomBytes(16).toString("hex"),
        hash = `${salt}:${scryptSync(process.env.ADMIN_PASSWORD, salt, 64).toString("hex")}`;
      const existing = (
        await db.query("SELECT id FROM users WHERE email=$1", [email])
      ).rows[0];
      if (existing) {
        await db.query("UPDATE users SET role='admin' WHERE id=$1", [
          existing.id,
        ]);
      } else {
        const id = randomUUID();
        await db.query(
          "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,'Administrator',$3,'admin')",
          [id, email, hash],
        );
        await ensureUser(db, id);
      }
    }
    console.log(
      "Seeded simulated markets and funded maker. Existing records preserved.",
    );
  });
}
main()
  .catch((e) => {
    console.error("Seed failed:", e.code ?? e.message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
