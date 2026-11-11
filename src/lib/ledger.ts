import type { PoolClient } from "pg";
import { proportionalCost } from "./money";
export const cash = (id: string, reserved = false) =>
  `user:${id}:credit:${reserved ? "reserved" : "available"}`;
export const shares = (
  id: string,
  market: string,
  outcome: string,
  reserved = false,
) => `user:${id}:${market}:${outcome}:${reserved ? "reserved" : "available"}`;
export async function account(
  db: PoolClient,
  id: string,
  owner: string | null = null,
  asset = "credit",
  negative = false,
) {
  await db.query(
    "INSERT INTO accounts(id,owner_id,asset,allow_negative) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [id, owner, asset, negative],
  );
  return id;
}
export async function balance(db: PoolClient, id: string) {
  return BigInt(
    (await db.query("SELECT balance FROM accounts WHERE id=$1", [id])).rows[0]
      ?.balance ?? "0",
  );
}
export async function post(
  db: PoolClient,
  kind: string,
  reference: string,
  description: string,
  movements: [string, bigint][],
) {
  const totals = new Map<string, bigint>();
  for (const [id, value] of movements)
    totals.set(id, (totals.get(id) ?? 0n) + value);
  const id = (
    await db.query(
      "INSERT INTO journal(kind,reference,description) VALUES($1,$2,$3) RETURNING id",
      [kind, reference, description],
    )
  ).rows[0].id;
  for (const [acct, value] of totals)
    if (value !== 0n) {
      await db.query("UPDATE accounts SET balance=balance+$2 WHERE id=$1", [
        acct,
        value.toString(),
      ]);
      await db.query(
        "INSERT INTO entries(journal_id,account_id,amount) VALUES($1,$2,$3)",
        [id, acct, value.toString()],
      );
    }
  return id;
}
export async function ensureUser(db: PoolClient, id: string) {
  await account(db, cash(id), id);
  await account(db, cash(id, true), id);
}
export async function ensureShares(
  db: PoolClient,
  user: string,
  market: string,
  outcome: string,
) {
  const asset = `${market}:${outcome}`;
  await account(db, shares(user, market, outcome), user, asset);
  await account(db, shares(user, market, outcome, true), user, asset);
  await account(db, `supply:${asset}`, null, asset, true);
  await db.query(
    "INSERT INTO position_stats(user_id,market_id,outcome) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [user, market, outcome],
  );
}
export async function addCost(
  db: PoolClient,
  user: string,
  market: string,
  outcome: string,
  cost: bigint,
) {
  await ensureShares(db, user, market, outcome);
  await db.query(
    "UPDATE position_stats SET cost=cost+$4 WHERE user_id=$1 AND market_id=$2 AND outcome=$3",
    [user, market, outcome, cost.toString()],
  );
}
// Call before removing inventory so weighted-average cost includes reserved shares.
export async function removeCost(
  db: PoolClient,
  user: string,
  market: string,
  outcome: string,
  quantity: bigint,
  proceeds: bigint,
) {
  const total =
    (await balance(db, shares(user, market, outcome))) +
    (await balance(db, shares(user, market, outcome, true)));
  const cost = BigInt(
    (
      await db.query(
        "SELECT cost FROM position_stats WHERE user_id=$1 AND market_id=$2 AND outcome=$3",
        [user, market, outcome],
      )
    ).rows[0]?.cost ?? "0",
  );
  const removed = proportionalCost(cost, total, quantity);
  await db.query(
    "UPDATE position_stats SET cost=cost-$4,realized=realized+$5 WHERE user_id=$1 AND market_id=$2 AND outcome=$3",
    [
      user,
      market,
      outcome,
      removed.toString(),
      (proceeds - removed).toString(),
    ],
  );
}
