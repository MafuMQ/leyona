import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
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
import { cancelOrder, executeOrder, placeOrder } from "../src/lib/exchange";
import {
  acceptCashout,
  acceptCombo,
  quoteCashout,
  quoteCombo,
} from "../src/lib/combos";
import { finalize } from "../src/lib/resolution";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL exchange and collateral integration", () => {
  let connection: Pool, db: PoolClient;
  let alice: string, bob: string, maker: string;
  const schema = `leyona_test_${randomUUID().replaceAll("-", "")}`;
  beforeAll(async () => {
    connection = new Pool({ connectionString: url });
    db = await connection.connect();
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`SET search_path TO ${schema}`);
    await db.query(await readFile("migrations/001_initial.sql", "utf8"));
  });
  afterAll(async () => {
    if (db) {
      if (!/^leyona_test_[a-f0-9]{32}$/.test(schema))
        throw new Error("Unsafe schema name");
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      db.release();
    }
    await connection?.end();
  });
  beforeEach(async () => {
    await db.query("BEGIN");
    const make = async (name: string, role = "user") => {
      const id = randomUUID();
      await db.query(
        "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$2,'disabled',$3)",
        [id, `${name}@test.local`, role],
      );
      await ensureUser(db, id);
      return id;
    };
    alice = await make("alice");
    bob = await make("bob");
    maker = await make("maker", "bot");
    await account(db, "system:issuance", null, "credit", true);
    await post(db, "test", randomUUID(), "Test funding", [
      ["system:issuance", -1020000000n],
      [cash(alice), 10000000n],
      [cash(bob), 10000000n],
      [cash(maker), 1000000000n],
    ]);
    for (const id of ["market-a", "market-b"])
      await db.query(
        "INSERT INTO markets(id,question,description,category,icon,closes_at,event_group) VALUES($1,$1,'Test rules','Tech','x',now()+interval '1 day',$1)",
        [id],
      );
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
  });
  const order = (
    user: string,
    side: "buy" | "sell",
    outcome: "yes" | "no",
    price: number,
    quantity: number,
    tif: "GTC" | "FOK" | "FAK" = "GTC",
  ) =>
    placeOrder(db, user, {
      marketId: "market-a",
      side,
      outcome,
      price,
      quantity,
      tif,
    });
  async function split(user: string, q = 100n) {
    await account(db, "collateral:market-a");
    for (const outcome of ["yes", "no"])
      await ensureShares(db, user, "market-a", outcome);
    await post(db, "split", randomUUID(), "Backed inventory", [
      [cash(user), -q * 10000n],
      ["collateral:market-a", q * 10000n],
      ["supply:market-a:yes", -q],
      [shares(user, "market-a", "yes"), q],
      ["supply:market-a:no", -q],
      [shares(user, "market-a", "no"), q],
    ]);
    for (const outcome of ["yes", "no"])
      await addCost(db, user, "market-a", outcome, q * 5000n);
  }
  it("creates complete sets from complementary buy orders and refunds price improvement", async () => {
    await order(bob, "buy", "no", 4000, 10);
    const fill = await order(alice, "buy", "yes", 7000, 10);
    expect(fill.state).toBe("filled");
    expect(await balance(db, cash(alice))).toBe(9940000n);
    expect(await balance(db, cash(alice, true))).toBe(0n);
    expect(await balance(db, "collateral:market-a")).toBe(100000n);
    expect(await balance(db, shares(alice, "market-a", "yes"))).toBe(10n);
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  });
  it("moves existing shares, tracks cost and releases a partial reservation", async () => {
    await split(maker);
    await order(maker, "sell", "yes", 6000, 5);
    const o = await order(alice, "buy", "yes", 6500, 10);
    expect(o.remaining).toBe(5);
    expect(await balance(db, cash(alice, true))).toBe(32500n);
    await cancelOrder(db, o.id, alice);
    await cancelOrder(db, o.id, alice);
    expect(await balance(db, cash(alice, true))).toBe(0n);
    expect(await balance(db, cash(alice))).toBe(9970000n);
    expect(await balance(db, "collateral:market-a")).toBe(1000000n);
  });
  it("burns complementary sell inventory and releases collateral", async () => {
    await order(bob, "buy", "no", 4000, 10);
    await order(alice, "buy", "yes", 6000, 10);
    await order(bob, "sell", "no", 4500, 10);
    await order(alice, "sell", "yes", 5000, 10);
    expect(await balance(db, "collateral:market-a")).toBe(0n);
    expect(await balance(db, shares(alice, "market-a", "yes"))).toBe(0n);
    expect(await balance(db, cash(alice))).toBe(9995000n);
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  });
  it("does not partially fill FOK and releases all funds", async () => {
    await split(maker);
    await order(maker, "sell", "yes", 5000, 5);
    const o = await order(alice, "buy", "yes", 6000, 10, "FOK");
    expect(o.state).toBe("canceled");
    expect(await balance(db, cash(alice))).toBe(10000000n);
    expect(await balance(db, shares(alice, "market-a", "yes"))).toBe(0n);
  });
  it("does not allow credit or inventory overspending", async () => {
    await expect(order(alice, "buy", "yes", 9999, 100000)).rejects.toThrow(
      "Not enough",
    );
    await expect(order(alice, "sell", "yes", 5000, 1)).rejects.toThrow(
      "Not enough",
    );
  });
  it("prevents self trading", async () => {
    await split(alice);
    await order(alice, "sell", "yes", 5000, 10);
    const o = await order(alice, "buy", "yes", 6000, 10, "FAK");
    expect(o.state).toBe("canceled");
    expect((await db.query("SELECT count(*) FROM fills")).rows[0].count).toBe(
      "0",
    );
  });
  it("reserves and cancels delayed live orders without executing early", async () => {
    await db.query("UPDATE markets SET live=true WHERE id='market-a'");
    const o = await order(alice, "buy", "yes", 5000, 10);
    expect(o.state).toBe("pending");
    expect(await balance(db, cash(alice, true))).toBe(50000n);
    await executeOrder(db, o.id);
    expect(
      (await db.query("SELECT state FROM orders WHERE id=$1", [o.id])).rows[0]
        .state,
    ).toBe("pending");
    await cancelOrder(db, o.id, alice);
    expect(await balance(db, cash(alice, true))).toBe(0n);
  });
  it("rejects a stale live feed", async () => {
    await db.query(
      "UPDATE markets SET live=true,updated_at=now()-interval '2 minutes' WHERE id='market-a'",
    );
    await expect(order(alice, "buy", "yes", 5000, 10)).rejects.toThrow("stale");
  });
  it("fully funds combos and prevents double acceptance", async () => {
    const q = await quoteCombo(
      db,
      alice,
      [
        { marketId: "market-a", outcome: "yes" },
        { marketId: "market-b", outcome: "no" },
      ],
      100000n,
    );
    const c = await acceptCombo(db, alice, q.id);
    expect(await balance(db, `combo:${c.id}`)).toBe(400000n);
    expect(await balance(db, cash(alice))).toBe(9900000n);
    await expect(acceptCombo(db, alice, q.id)).rejects.toThrow(
      "already accepted",
    );
  });
  it("rejects quotes after a leg price changes and same-event combos", async () => {
    const q = await quoteCombo(
      db,
      alice,
      [
        { marketId: "market-a", outcome: "yes" },
        { marketId: "market-b", outcome: "no" },
      ],
      100000n,
    );
    await db.query("UPDATE markets SET yes_price=5100 WHERE id='market-a'");
    await expect(acceptCombo(db, alice, q.id)).rejects.toThrow("changed");
    await expect(
      quoteCombo(
        db,
        alice,
        [
          { marketId: "market-a", outcome: "yes" },
          { marketId: "market-a", outcome: "no" },
        ],
        100000n,
      ),
    ).rejects.toThrow("same-event");
  });
  it("closes a combo through funded maker buyback", async () => {
    const q = await quoteCombo(
        db,
        alice,
        [
          { marketId: "market-a", outcome: "yes" },
          { marketId: "market-b", outcome: "yes" },
        ],
        100000n,
      ),
      c = await acceptCombo(db, alice, q.id),
      exit = await quoteCashout(db, alice, c.id);
    await acceptCashout(db, alice, exit.id);
    expect(await balance(db, `combo:${c.id}`)).toBe(0n);
    expect(await balance(db, cash(alice))).toBe(9995000n);
    await expect(acceptCashout(db, alice, exit.id)).rejects.toThrow(
      "no longer available",
    );
  });
  it("settles winning binary positions once and releases all collateral", async () => {
    await order(bob, "buy", "no", 4000, 10);
    await order(alice, "buy", "yes", 6000, 10);
    await db.query(
      "UPDATE markets SET status='proposed',result='yes',challenge_until=now()-interval '1 second' WHERE id='market-a'",
    );
    await finalize(db, "market-a");
    expect(await balance(db, cash(alice))).toBe(10040000n);
    expect(await balance(db, "collateral:market-a")).toBe(0n);
    await expect(finalize(db, "market-a")).rejects.toThrow(
      "needs dispute review",
    );
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  });
  it("refunds the original combo stake if any final leg is void", async () => {
    const q = await quoteCombo(
        db,
        alice,
        [
          { marketId: "market-a", outcome: "yes" },
          { marketId: "market-b", outcome: "yes" },
        ],
        100000n,
      ),
      c = await acceptCombo(db, alice, q.id);
    await db.query(
      "UPDATE markets SET status='proposed',result=CASE WHEN id='market-a' THEN 'void' ELSE 'no' END,challenge_until=now()-interval '1 second'",
    );
    await finalize(db, "market-a");
    expect(await balance(db, `combo:${c.id}`)).toBe(400000n);
    await finalize(db, "market-b");
    expect(await balance(db, `combo:${c.id}`)).toBe(0n);
    expect(await balance(db, cash(alice))).toBe(10000000n);
  });
  it("blocks finalization during disputes and challenge windows", async () => {
    await db.query(
      "UPDATE markets SET status='proposed',result='yes',challenge_until=now()+interval '1 hour' WHERE id='market-a'",
    );
    await expect(finalize(db, "market-a")).rejects.toThrow("Challenge window");
    await db.query(
      "UPDATE markets SET status='disputed',challenge_until=now()-interval '1 hour' WHERE id='market-a'",
    );
    await expect(finalize(db, "market-a")).rejects.toThrow("dispute review");
  });
  it("enforces per-asset balancing at the database boundary", async () => {
    await post(db, "test", randomUUID(), "Unbalanced test", [
      [cash(alice), 1n],
    ]);
    await expect(db.query("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toThrow(
      "Unbalanced journal",
    );
  });
  it("rejects expired combo quotes", async () => {
    const q = await quoteCombo(
      db,
      alice,
      [
        { marketId: "market-a", outcome: "yes" },
        { marketId: "market-b", outcome: "no" },
      ],
      100000n,
    );
    await db.query(
      "UPDATE combo_quotes SET expires_at=now()-interval '1 second' WHERE id=$1",
      [q.id],
    );
    await expect(acceptCombo(db, alice, q.id)).rejects.toThrow("Quote expired");
  });
  it("rejects journal history edits at the database boundary", async () => {
    await expect(
      db.query("UPDATE journal SET description='tampered'"),
    ).rejects.toThrow("immutable");
  });
  it("serializes 50 concurrent reservations without overspending one account", async () => {
    await db.query("COMMIT");
    const commands = await Promise.allSettled(
      Array.from({ length: 50 }, async () => {
        const client = await connection.connect();
        try {
          await client.query("BEGIN");
          await client.query(`SET LOCAL search_path TO ${schema}`);
          await client.query("SELECT pg_advisory_xact_lock(19661111)");
          const result = await placeOrder(client, alice, {
            marketId: "market-a",
            outcome: "yes",
            side: "buy",
            price: 5000,
            quantity: 100,
            tif: "GTC",
          });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }),
    );
    expect(commands.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    expect(await balance(db, cash(alice))).toBe(0n);
    expect(await balance(db, cash(alice, true))).toBe(10000000n);
  });
});
