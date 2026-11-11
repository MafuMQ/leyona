// Run only against the disposable development server used for verification.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (process.env.LEYONA_SMOKE_TEST !== "1")
  throw new Error(
    "Set LEYONA_SMOKE_TEST=1 only for an isolated development server.",
  );
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
let cookie = "";
async function request(
  path: string,
  body?: unknown,
  key = randomUUID(),
  customOrigin = origin,
) {
  const response = await fetch(
    `${origin}/api/${path}`,
    body === undefined
      ? { headers: { cookie } }
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: customOrigin,
            "Idempotency-Key": key,
            cookie,
          },
          body: JSON.stringify(body),
        },
  );
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, data: await response.json() };
}
const id = randomUUID().slice(0, 8),
  email = `http-test-${id}@leyona.local`,
  password = `Isolated-test-${randomUUID()}`;
assert.equal((await request("state")).data.mode, "connected");
assert.equal(
  (await request("auth/register", { name: "HTTP Tester", email, password }))
    .status,
  200,
);
const key = randomUUID();
assert.equal(
  (await request("credits/top-ups", { amount: "100" }, key)).status,
  200,
);
assert.equal(
  (await request("credits/top-ups", { amount: "100" }, key)).status,
  200,
);
assert.notEqual(
  (await request("credits/top-ups", { amount: "200" }, key)).status,
  200,
);
let state = (await request("state")).data;
assert.equal(state.portfolio.balance, "1000000");
assert.equal(
  (
    await request(
      "credits/top-ups",
      { amount: "100" },
      randomUUID(),
      "https://untrusted.example",
    )
  ).status,
  403,
);
const order = await request("orders", {
  marketId: "fed-rate",
  outcome: "yes",
  side: "buy",
  price: 1000,
  quantity: 2,
  tif: "GTC",
});
assert.equal(order.status, 200);
state = (await request("state")).data;
assert.equal(state.portfolio.reserved, "2000");
assert.equal(
  (await request("orders/cancel", { id: order.data.id })).status,
  200,
);
state = (await request("state")).data;
assert.equal(state.portfolio.balance, "1000000");
assert.equal(state.portfolio.reserved, "0");
const filled = await request("orders", {
  marketId: "fed-rate",
  outcome: "yes",
  side: "buy",
  price: 7000,
  quantity: 2,
  tif: "FAK",
});
assert.equal(filled.status, 200);
assert.equal(filled.data.state, "filled");
state = (await request("state")).data;
assert(
  state.portfolio.positions.some(
    (p: { market_id: string; available: string }) =>
      p.market_id === "fed-rate" && p.available === "2",
  ),
);
const q = await request("combos/quotes", {
  legs: [
    { marketId: "fed-rate", outcome: "yes" },
    { marketId: "rain", outcome: "no" },
  ],
  stake: "2",
});
assert.equal(q.status, 200);
const combo = await request("combos/accept", { id: q.data.id });
assert.equal(combo.status, 200);
assert.notEqual(
  (await request("combos/accept", { id: q.data.id })).status,
  200,
);
const exit = await request("combos/cashout-quote", { id: combo.data.id });
assert.equal(exit.status, 200);
assert.equal(
  (await request("combos/cashout", { id: exit.data.id })).status,
  200,
);
assert.notEqual(
  (await request("admin/status", { marketId: "rain", status: "suspended" }))
    .status,
  200,
);
assert.equal((await request("auth/logout", {})).status, 200);
assert.equal((await request("credits/top-ups", { amount: "1" })).status, 401);
assert.equal((await request("auth/login", { email, password })).status, 200);
console.log(
  "HTTP smoke checks passed: auth, top-up idempotency, CSRF, reservation/cancellation, share purchase, combo entry/exit, role protection and logout/login.",
);
