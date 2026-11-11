import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  account,
  addCost,
  balance,
  cash,
  ensureShares,
  ensureUser,
  post,
  removeCost,
  shares,
} from "./ledger";
type Order = {
  id: string;
  user_id: string;
  market_id: string;
  outcome: "yes" | "no";
  side: "buy" | "sell";
  price: number;
  quantity: number;
  remaining: number;
  state: string;
  tif: string;
  priority: string;
  expires_at: Date | null;
  eligible_at: Date;
};
export async function tradable(db: PoolClient, market: string) {
  const m = (await db.query("SELECT * FROM markets WHERE id=$1", [market]))
    .rows[0];
  if (
    !m ||
    m.status !== "open" ||
    new Date(m.closes_at).getTime() <= Date.now()
  )
    throw new Error("This market is not open for trading.");
  if (m.live && Date.now() - new Date(m.updated_at).getTime() > 60000)
    throw new Error(
      "Live simulation is stale. Start the worker to resume trading.",
    );
  return m;
}
export async function cancelOrder(db: PoolClient, id: string, owner?: string) {
  const o: Order = (await db.query("SELECT * FROM orders WHERE id=$1", [id]))
    .rows[0];
  if (!o || (owner && o.user_id !== owner)) throw new Error("Order not found.");
  if (!["pending", "open"].includes(o.state)) return;
  if (o.remaining) {
    const from =
      o.side === "buy"
        ? cash(o.user_id, true)
        : shares(o.user_id, o.market_id, o.outcome, true);
    const to =
      o.side === "buy"
        ? cash(o.user_id)
        : shares(o.user_id, o.market_id, o.outcome);
    const value = BigInt(o.remaining) * BigInt(o.side === "buy" ? o.price : 1);
    await post(
      db,
      "release",
      `cancel:${o.id}`,
      "Order canceled; reservation released",
      [
        [from, -value],
        [to, value],
      ],
    );
  }
  await db.query("UPDATE orders SET state='canceled' WHERE id=$1", [id]);
}
export async function executeOrder(db: PoolClient, orderId: string) {
  const o: Order = (
    await db.query("SELECT * FROM orders WHERE id=$1", [orderId])
  ).rows[0];
  if (!o || !["open", "pending"].includes(o.state)) return;
  if (o.state === "pending" && o.eligible_at.getTime() > Date.now()) return;
  if (o.expires_at && o.expires_at.getTime() <= Date.now()) {
    await cancelOrder(db, o.id);
    return;
  }
  await tradable(db, o.market_id);
  await db.query("UPDATE orders SET state='open' WHERE id=$1", [o.id]);
  const candidates: Order[] = (
    await db.query(
      "SELECT * FROM orders WHERE market_id=$1 AND id<>$2 AND user_id<>$3 AND state='open' AND remaining>0 AND (expires_at IS NULL OR expires_at>now())",
      [o.market_id, o.id, o.user_id],
    )
  ).rows;
  const effective = (m: Order) =>
    m.outcome === o.outcome ? m.price : 10000 - m.price;
  const compatible = candidates.filter(
    (m) =>
      ((m.outcome === o.outcome && m.side !== o.side) ||
        (m.outcome !== o.outcome && m.side === o.side)) &&
      (o.side === "buy" ? effective(m) <= o.price : effective(m) >= o.price),
  );
  compatible.sort(
    (a, b) =>
      (o.side === "buy"
        ? effective(a) - effective(b)
        : effective(b) - effective(a)) ||
      (BigInt(a.priority) < BigInt(b.priority) ? -1 : 1),
  );
  if (
    o.tif === "FOK" &&
    compatible.reduce((q, m) => q + m.remaining, 0) < o.remaining
  ) {
    await cancelOrder(db, o.id);
    return;
  }
  for (const m of compatible) {
    if (o.remaining === 0) break;
    const quantity = Math.min(o.remaining, m.remaining),
      q = BigInt(quantity),
      op = effective(m),
      fillId = randomUUID();
    const moves: [string, bigint][] = [];
    const charge = (buyer: Order, price: number) => {
      moves.push(
        [cash(buyer.user_id, true), -q * BigInt(buyer.price)],
        [cash(buyer.user_id), q * BigInt(buyer.price - price)],
      );
    };
    await ensureShares(db, o.user_id, o.market_id, o.outcome);
    await ensureShares(db, m.user_id, m.market_id, m.outcome);
    if (m.outcome === o.outcome) {
      const buyer = o.side === "buy" ? o : m,
        seller = o.side === "sell" ? o : m,
        price = m.price;
      charge(buyer, price);
      await removeCost(
        db,
        seller.user_id,
        o.market_id,
        o.outcome,
        q,
        q * BigInt(price),
      );
      await addCost(
        db,
        buyer.user_id,
        o.market_id,
        o.outcome,
        q * BigInt(price),
      );
      moves.push(
        [cash(seller.user_id), q * BigInt(price)],
        [shares(seller.user_id, o.market_id, o.outcome, true), -q],
        [shares(buyer.user_id, o.market_id, o.outcome), q],
      );
    } else if (o.side === "buy") {
      charge(o, op);
      charge(m, m.price);
      const collateral = await account(db, `collateral:${o.market_id}`);
      moves.push(
        [collateral, q * 10000n],
        [`supply:${o.market_id}:${o.outcome}`, -q],
        [shares(o.user_id, o.market_id, o.outcome), q],
        [`supply:${o.market_id}:${m.outcome}`, -q],
        [shares(m.user_id, m.market_id, m.outcome), q],
      );
      await addCost(db, o.user_id, o.market_id, o.outcome, q * BigInt(op));
      await addCost(db, m.user_id, m.market_id, m.outcome, q * BigInt(m.price));
    } else {
      await removeCost(
        db,
        o.user_id,
        o.market_id,
        o.outcome,
        q,
        q * BigInt(op),
      );
      await removeCost(
        db,
        m.user_id,
        m.market_id,
        m.outcome,
        q,
        q * BigInt(m.price),
      );
      moves.push(
        [`collateral:${o.market_id}`, -q * 10000n],
        [cash(o.user_id), q * BigInt(op)],
        [cash(m.user_id), q * BigInt(m.price)],
        [shares(o.user_id, o.market_id, o.outcome, true), -q],
        [`supply:${o.market_id}:${o.outcome}`, q],
        [shares(m.user_id, m.market_id, m.outcome, true), -q],
        [`supply:${o.market_id}:${m.outcome}`, q],
      );
    }
    await post(db, "fill", fillId, "Prediction shares traded", moves);
    await db.query(
      "INSERT INTO fills(id,market_id,maker_id,taker_id,outcome,price,quantity) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [fillId, o.market_id, m.id, o.id, o.outcome, op, quantity],
    );
    o.remaining -= quantity;
    m.remaining -= quantity;
    await db.query("UPDATE orders SET remaining=$2,state=$3 WHERE id=$1", [
      m.id,
      m.remaining,
      m.remaining ? "open" : "filled",
    ]);
    await db.query("UPDATE orders SET remaining=$2,state=$3 WHERE id=$1", [
      o.id,
      o.remaining,
      o.remaining ? "open" : "filled",
    ]);
    await db.query(
      "UPDATE markets SET yes_price=$2,volume=volume+$3 WHERE id=$1",
      [
        o.market_id,
        o.outcome === "yes" ? op : 10000 - op,
        (q * BigInt(op)).toString(),
      ],
    );
  }
  if (o.remaining && ["FAK", "FOK"].includes(o.tif))
    await cancelOrder(db, o.id);
  await db.query("INSERT INTO outbox(topic,data) VALUES('market',$1)", [
    JSON.stringify({ marketId: o.market_id }),
  ]);
}
export async function placeOrder(
  db: PoolClient,
  user: string,
  input: {
    marketId: string;
    outcome: "yes" | "no";
    side: "buy" | "sell";
    price: number;
    quantity: number;
    tif: "GTC" | "GTD" | "FAK" | "FOK";
    expiresAt?: string;
  },
) {
  const m = await tradable(db, input.marketId);
  await ensureUser(db, user);
  await ensureShares(db, user, input.marketId, input.outcome);
  const value =
    BigInt(input.quantity) * BigInt(input.side === "buy" ? input.price : 1);
  const from =
      input.side === "buy"
        ? cash(user)
        : shares(user, input.marketId, input.outcome),
    to =
      input.side === "buy"
        ? cash(user, true)
        : shares(user, input.marketId, input.outcome, true);
  if ((await balance(db, from)) < value)
    throw new Error(
      input.side === "buy"
        ? "Not enough available credits. Add credits to continue."
        : "Not enough available shares to sell.",
    );
  if (
    input.tif === "GTD" &&
    (!input.expiresAt || new Date(input.expiresAt).getTime() <= Date.now())
  )
    throw new Error("Choose a future expiration.");
  const id = randomUUID(),
    delayed = m.live;
  await post(db, "reserve", `reserve:${id}`, "Order reservation", [
    [from, -value],
    [to, value],
  ]);
  await db.query(
    "INSERT INTO orders(id,user_id,market_id,outcome,side,price,quantity,remaining,state,tif,eligible_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11)",
    [
      id,
      user,
      input.marketId,
      input.outcome,
      input.side,
      input.price,
      input.quantity,
      delayed ? "pending" : "open",
      input.tif,
      new Date(Date.now() + (delayed ? 3000 : 0)),
      input.expiresAt ?? null,
    ],
  );
  if (!delayed) await executeOrder(db, id);
  return (await db.query("SELECT * FROM orders WHERE id=$1", [id])).rows[0];
}
