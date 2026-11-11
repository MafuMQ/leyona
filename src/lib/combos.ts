import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { account, balance, cash, post } from "./ledger";
import { comboPayout } from "./money";
import { tradable } from "./exchange";
export type Leg = {
  marketId: string;
  outcome: "yes" | "no";
  price?: number;
  version?: string;
};
async function priceLegs(db: PoolClient, legs: Leg[]) {
  const groups = new Set<string>(),
    ids = new Set<string>(),
    priced: Leg[] = [];
  for (const leg of legs) {
    const m = await tradable(db, leg.marketId);
    if (ids.has(m.id) || groups.has(m.event_group))
      throw new Error("Duplicate or same-event legs are not supported yet.");
    ids.add(m.id);
    groups.add(m.event_group);
    // Simulation-only quotes assume different curated event groups are independent.
    priced.push({
      ...leg,
      price: leg.outcome === "yes" ? m.yes_price : 10000 - m.yes_price,
      version: new Date(m.updated_at).toISOString(),
    });
  }
  return priced;
}
export async function quoteCombo(
  db: PoolClient,
  user: string,
  legs: Leg[],
  stake: bigint,
) {
  const priced = await priceLegs(db, legs),
    payout = comboPayout(
      stake,
      priced.map((l) => l.price!),
    );
  if (payout > 1_000_000n * 10000n)
    throw new Error(
      "Maximum combo payout is 1,000,000 credits. Reduce your stake or legs.",
    );
  const maker = (
    await db.query(
      "SELECT id FROM users WHERE role='bot' ORDER BY created_at LIMIT 1",
    )
  ).rows[0];
  if (!maker || (await balance(db, cash(maker.id))) < payout - stake)
    throw new Error("No funded maker is available for this quote.");
  return (
    await db.query(
      "INSERT INTO combo_quotes(user_id,maker_id,legs,stake,payout,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '20 seconds') RETURNING *",
      [
        user,
        maker.id,
        JSON.stringify(priced),
        stake.toString(),
        payout.toString(),
      ],
    )
  ).rows[0];
}
export async function acceptCombo(
  db: PoolClient,
  user: string,
  quoteId: string,
) {
  const q = (
    await db.query("SELECT * FROM combo_quotes WHERE id=$1 AND user_id=$2", [
      quoteId,
      user,
    ])
  ).rows[0];
  if (!q || q.accepted || new Date(q.expires_at).getTime() <= Date.now())
    throw new Error("Quote expired or already accepted. Request a new quote.");
  const current = await priceLegs(db, q.legs);
  if (
    current.some(
      (leg, i) =>
        leg.price !== q.legs[i].price || leg.version !== q.legs[i].version,
    )
  )
    throw new Error("A leg changed. Request a new quote.");
  const stake = BigInt(q.stake),
    payout = BigInt(q.payout);
  if ((await balance(db, cash(user))) < stake)
    throw new Error("Not enough credits for this combo.");
  if ((await balance(db, cash(q.maker_id))) < payout - stake)
    throw new Error("Maker funds changed. Request a new quote.");
  const id = randomUUID(),
    escrow = await account(db, `combo:${id}`);
  await post(
    db,
    "combo-entry",
    `combo:${id}`,
    "Fully collateralized combo opened",
    [
      [cash(user), -stake],
      [cash(q.maker_id), -(payout - stake)],
      [escrow, payout],
    ],
  );
  await db.query("UPDATE combo_quotes SET accepted=true WHERE id=$1", [q.id]);
  return (
    await db.query(
      "INSERT INTO combos(id,quote_id,user_id,maker_id,legs,stake,payout) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [id, q.id, user, q.maker_id, JSON.stringify(q.legs), q.stake, q.payout],
    )
  ).rows[0];
}
export async function quoteCashout(db: PoolClient, user: string, id: string) {
  const c = (
    await db.query(
      "SELECT * FROM combos WHERE id=$1 AND user_id=$2 AND state='open'",
      [id, user],
    )
  ).rows[0];
  if (!c) throw new Error("Open combo not found.");
  const legs = await priceLegs(db, c.legs);
  const probability = legs.reduce((v, l) => v * BigInt(l.price!), 1n),
    denominator = 10000n ** BigInt(legs.length);
  const value = (((BigInt(c.payout) * probability) / denominator) * 95n) / 100n;
  return (
    await db.query(
      "INSERT INTO cashout_quotes(combo_id,user_id,amount,expires_at) VALUES($1,$2,$3,now()+interval '15 seconds') RETURNING *",
      [id, user, value.toString()],
    )
  ).rows[0];
}
export async function acceptCashout(db: PoolClient, user: string, id: string) {
  const q = (
    await db.query(
      "SELECT q.*,c.state,c.legs,c.payout,c.maker_id FROM cashout_quotes q JOIN combos c ON c.id=q.combo_id WHERE q.id=$1 AND q.user_id=$2",
      [id, user],
    )
  ).rows[0];
  if (
    !q ||
    q.accepted ||
    q.state !== "open" ||
    new Date(q.expires_at).getTime() <= Date.now()
  )
    throw new Error("Cash-out quote is no longer available.");
  await priceLegs(db, q.legs);
  const value = BigInt(q.amount),
    payout = BigInt(q.payout);
  await post(
    db,
    "combo-cashout",
    `cashout:${q.combo_id}`,
    "Combo sold back to market maker",
    [
      [`combo:${q.combo_id}`, -payout],
      [cash(user), value],
      [cash(q.maker_id), payout - value],
    ],
  );
  await db.query("UPDATE cashout_quotes SET accepted=true WHERE id=$1", [id]);
  await db.query("UPDATE combos SET state='sold' WHERE id=$1", [q.combo_id]);
  return { amount: q.amount };
}
export async function settleCombos(db: PoolClient) {
  const combos = (await db.query("SELECT * FROM combos WHERE state='open'"))
    .rows;
  for (const c of combos) {
    const markets = (
      await db.query(
        "SELECT id,result,status FROM markets WHERE id=ANY($1::text[])",
        [c.legs.map((l: Leg) => l.marketId)],
      )
    ).rows;
    if (
      markets.length !== c.legs.length ||
      markets.some((m) => m.status !== "settled")
    )
      continue;
    const voided = markets.some((m) => m.result === "void"),
      won =
        !voided &&
        c.legs.every(
          (l: Leg) =>
            markets.find((m) => m.id === l.marketId)?.result === l.outcome,
        );
    const payout = BigInt(c.payout),
      stake = BigInt(c.stake),
      userAmount = voided ? stake : won ? payout : 0n;
    await post(
      db,
      "combo-settlement",
      `combo-settle:${c.id}`,
      `Combo ${voided ? "void" : won ? "won" : "lost"}`,
      [
        [`combo:${c.id}`, -payout],
        [cash(c.user_id), userAmount],
        [cash(c.maker_id), payout - userAmount],
      ],
    );
    await db.query("UPDATE combos SET state=$2 WHERE id=$1", [
      c.id,
      voided ? "void" : won ? "won" : "lost",
    ]);
  }
}
