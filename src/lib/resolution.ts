import type { PoolClient } from "pg";
import { account, balance, cash, post, removeCost, shares } from "./ledger";
import { cancelOrder } from "./exchange";
import { settleCombos } from "./combos";
export async function clearMarket(db: PoolClient, id: string) {
  for (const order of (
    await db.query(
      "SELECT id FROM orders WHERE market_id=$1 AND state IN ('open','pending')",
      [id],
    )
  ).rows)
    await cancelOrder(db, order.id);
}
export async function finalize(db: PoolClient, id: string) {
  const m = (await db.query("SELECT * FROM markets WHERE id=$1", [id])).rows[0];
  if (
    !m ||
    m.status !== "proposed" ||
    !m.result ||
    new Date(m.challenge_until).getTime() > Date.now()
  )
    throw new Error(
      "Challenge window is still open, or this result needs dispute review.",
    );
  await clearMarket(db, id);
  for (const outcome of ["yes", "no"]) {
    const asset = `${id}:${outcome}`,
      payout = m.result === "void" ? 5000n : m.result === outcome ? 10000n : 0n;
    const holders = (
      await db.query(
        "SELECT owner_id,balance FROM accounts WHERE asset=$1 AND owner_id IS NOT NULL AND balance>0 AND id LIKE '%:available'",
        [asset],
      )
    ).rows;
    await account(db, `supply:${asset}`, null, asset, true);
    for (const holder of holders) {
      const q = BigInt(holder.balance),
        value = q * payout;
      await removeCost(db, holder.owner_id, id, outcome, q, value);
      await post(
        db,
        "settlement",
        `settle:${id}:${outcome}:${holder.owner_id}`,
        `${m.question} · ${m.result}`,
        [
          [`collateral:${id}`, -value],
          [cash(holder.owner_id), value],
          [shares(holder.owner_id, id, outcome), -q],
          [`supply:${asset}`, q],
        ],
      );
    }
  }
  if ((await balance(db, `collateral:${id}`)) !== 0n)
    throw new Error("Settlement reconciliation failed.");
  await db.query(
    "UPDATE markets SET status='settled',updated_at=now() WHERE id=$1",
    [id],
  );
  await settleCombos(db);
}
