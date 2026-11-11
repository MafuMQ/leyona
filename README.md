# Leyona

A local, simulated-credit prediction market built with **Next.js, React, TypeScript and PostgreSQL**. A separate Node.js worker runs simulation, bots, delayed orders and settlement. There is no NestJS, crypto wallet or payment integration.

## Run locally

Requires Node.js 22.12+ and PostgreSQL 16+ (development verification uses PostgreSQL 18).

1. `npm install`
2. Copy `.env.example` to `.env.local` and configure a valid `DATABASE_URL`. URL-encode special characters in passwords. The bootstrap creates only a database named `leyona`; it does not reset existing data.
3. Optionally set `ADMIN_EMAIL` and an `ADMIN_PASSWORD` of at least 12 characters before seeding. No administrator credentials are hardcoded. For an existing registered account, these values promote its role without changing its password.
4. Run:

```powershell
npm run db:create
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal:

```powershell
npm run worker
```

Open [Leyona locally](http://127.0.0.1:3000). `APP_ORIGIN` must match the origin used in the browser. The default is `http://127.0.0.1:3000`; use that address rather than `localhost` unless you change the setting.

Create a user account and use **Add credits** to issue free test credits. The seed creates nine fictional/simulated markets and a funded simulation maker. Seeding is repeatable and preserves existing records. Stop the app and worker with Ctrl+C.

The page remains a clearly labeled **read-only preview** if the database is unreachable or migrations have not run. Preview mode cannot create accounts or trade and does not store balances in the browser.

## Available in this development version

- Polymarket-style responsive market feed, topic/search/filter/sort controls and watchlists.
- Registration/login/logout, hashed passwords, hashed cookie sessions, admin authorization and origin checks.
- Unlimited simulated top-ups, integer credit accounting, immutable double-entry journals and database-enforced nonnegative user balances.
- Buy/sell Yes or No with whole shares; direct matching, complementary buy minting and complementary sell merging; price/time priority and self-trade prevention.
- GTC, one-hour GTD, FOK and FAK orders; partial fills, reservations, price improvement, cancellation and cancel-all. Market tickets use FAK orders with a one-cent guard around the best displayed quote.
- Portfolio with available/reserved balances, average cost, realized/unrealized position P&L, open orders, combos and credit activity.
- Cross-category 2–6-leg combo quoting, expiry, acceptance, fully funded escrow and quoted maker buyback. Independent-group pricing is a simulation model, not a general correlated-event pricing engine.
- Live simulated fixtures, persistent simulator ticks, 3-second execution delay and stale-data rejection.
- Admin market authoring, pause/reopen, evidence-based resolution proposals and review; user disputes; automatic payouts after the configurable challenge period. Binary void pays 0.5 credits per share; a void combo returns its entry stake after all legs finalize.
- Basic market comments and reconciliation tooling.

## Correctness and verification

Credits use integer units of **0.0001 credit** and whole share quantities. API monetary values are strings containing integer ledger units. The matching engine never uses floating point for debits, inventory, collateral or payouts. UI formatting is not authoritative.

All financial commands, seed operations and worker ticks acquire the same PostgreSQL transaction advisory lock. This deliberately serializes writes for the initial tester group, including commands spanning multiple markets. Journal entries, balance changes, fills and idempotent command results commit together. The SQL journal constraint checks balance **per asset**, and historical entries cannot be updated or deleted through ordinary SQL row operations. Application database roles should not have schema-altering privileges in a shared deployment.

```powershell
npm run typecheck
npm test
npm run build
npm run db:check
```

`npm test` runs arithmetic tests. It also runs the PostgreSQL integration suite when `TEST_DATABASE_URL` is explicitly set. Use a disposable development database. The integration suite creates an isolated, randomly named `leyona_test_*` schema and removes only that schema afterward.

```powershell
$env:TEST_DATABASE_URL='postgresql://YOUR_TEST_ROLE:YOUR_PASSWORD@127.0.0.1:5432/leyona_test'
npm test
```

Integration scenarios cover mint/transfer/merge, refunds, cost accounting, FOK behavior, insufficient funds, self-trading, delayed orders, stale feeds, combo funding/expiry/buyback, binary and combo settlement, dispute holds, immutable journals and 50 competing reservations against one account.

## Boundaries of this version

This is the first development implementation, not full Polymarket feature parity. Live scores and all seeded questions are simulation fixtures. Refresh uses short polling rather than WebSockets/SSE. Full authentication recovery/verification, richer profiles/social/moderation, notifications, leaderboards, rewards/referrals, external feeds, feed-driven start/suspension scenarios, advanced exclusive-outcome conversion, fractional shares, correlated combo pricing, automated operating alerts and sustained 50-user load verification remain future work. Admin proposals are retained in the audit log; richer versioned rule/proposal tooling is still planned.

The worker currently polls one durable queue every few seconds; long worker pauses can delay eligibility and settlement, while server-side status/time checks continue to reject invalid trades. Suspended markets are not automatically reopened. Results are final in normal operations; post-final corrections need a separate compensating workflow.

See [the implementation plan](docs/implementation-plan.md) and [development status](docs/development-status.md) for scope and follow-up work.
