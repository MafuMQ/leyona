import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "@/lib/db";
import {
  createSession,
  currentUser,
  hashToken,
  passwordHash,
  passwordMatches,
} from "@/lib/auth";
import { account, cash, ensureUser, post } from "@/lib/ledger";
import { placeOrder, cancelOrder } from "@/lib/exchange";
import {
  acceptCashout,
  acceptCombo,
  quoteCashout,
  quoteCombo,
} from "@/lib/combos";
import { clearMarket, finalize } from "@/lib/resolution";
import { marketDetail, portfolio, publicState } from "@/lib/read";
import { units } from "@/lib/money";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const legSchema = z.object({
  marketId: z.string().min(1).max(100),
  outcome: z.enum(["yes", "no"]),
});
async function rate(key: string, limit: number) {
  const result = await pool().query(
    `INSERT INTO rate_limits(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE rate_limits.count+1 END,
    window_start=CASE WHEN rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE rate_limits.window_start END RETURNING count`,
    [key],
  );
  if (result.rows[0].count > limit)
    throw new Error("Too many requests. Please wait a minute.");
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path.join("/");
    if (path === "state") {
      const state = await publicState();
      const user = state.mode === "connected" ? await currentUser() : null;
      return json({
        ...state,
        user,
        portfolio: user ? await portfolio(user.id) : null,
        watchlist: user
          ? (
              await pool().query(
                "SELECT market_id FROM watchlists WHERE user_id=$1",
                [user.id],
              )
            ).rows.map((r) => r.market_id)
          : [],
      });
    }
    if (path.startsWith("markets/"))
      return json(await marketDetail(path.split("/")[1]));
    if (path === "admin/disputes") {
      const user = await currentUser();
      if (user?.role !== "admin")
        return json({ error: "Admin access required." }, 403);
      return json(
        (
          await pool().query(
            "SELECT d.*,m.question,u.name FROM disputes d JOIN markets m ON m.id=d.market_id JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC",
          )
        ).rows,
      );
    }
    return json({ error: "Not found." }, 404);
  } catch {
    return json(
      { error: "Database unavailable. Check local PostgreSQL configuration." },
      503,
    );
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const origin = request.headers.get("origin"),
      expected = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
    if (origin !== expected)
      return json({ error: "Request origin is not allowed." }, 403);
    if (Number(request.headers.get("content-length") ?? 0) > 16384)
      return json({ error: "Request is too large." }, 413);
    const raw = await request.text();
    if (raw.length > 16384)
      return json({ error: "Request is too large." }, 413);
    const body = JSON.parse(raw || "{}");
    const path = (await params).path.join("/");
    if (path === "auth/register" || path === "auth/login") {
      await rate("auth:global", 60);
      const input = z
        .object({
          email: z
            .email()
            .max(200)
            .transform((s) => s.toLowerCase()),
          password: z.string().min(10).max(128),
          name: z.string().trim().min(2).max(40).optional(),
        })
        .parse(body);
      let user;
      if (path === "auth/register") {
        if (!input.name) throw new Error("Enter your display name.");
        user = await transaction(async (db) => {
          if (
            (
              await db.query("SELECT id FROM users WHERE email=$1", [
                input.email,
              ])
            ).rowCount
          )
            throw new Error("This email is already registered.");
          const result = (
            await db.query(
              "INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,role",
              [input.email, input.name, passwordHash(input.password)],
            )
          ).rows[0];
          await ensureUser(db, result.id);
          return result;
        });
      } else {
        user = (
          await pool().query(
            "SELECT * FROM users WHERE email=$1 AND role<>'bot'",
            [input.email],
          )
        ).rows[0];
        // Perform a hash even for unknown accounts to reduce timing differences.
        const valid = passwordMatches(
          input.password,
          user?.password_hash ?? passwordHash("dummy-password"),
        );
        if (!user || !valid)
          return json({ error: "Email or password is incorrect." }, 401);
      }
      await createSession(user.id);
      return json({ ok: true });
    }
    if (path === "auth/logout") {
      const token = (await cookies()).get("leyona_session")?.value;
      if (token)
        await pool().query("DELETE FROM sessions WHERE token_hash=$1", [
          hashToken(token),
        ]);
      (await cookies()).delete("leyona_session");
      return json({ ok: true });
    }
    const user = await currentUser();
    if (!user) return json({ error: "Sign in to continue." }, 401);
    await rate(`write:${user.id}`, 120);
    const key = z
      .string()
      .min(8)
      .max(128)
      .parse(request.headers.get("idempotency-key"));
    const fingerprint = createHash("sha256")
      .update(path + raw)
      .digest("hex");
    const result = await transaction(async (db) => {
      const prior = (
        await db.query(
          "SELECT fingerprint,response FROM commands WHERE user_id=$1 AND key=$2",
          [user.id, key],
        )
      ).rows[0];
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new Error(
            "Idempotency key was already used for a different request.",
          );
        return prior.response;
      }
      let response: unknown = { ok: true };
      if (path === "credits/top-ups") {
        const input = z.object({ amount: z.string() }).parse(body),
          value = units(input.amount);
        if (value <= 0n || value > 1000000n * 10000n)
          throw new Error(
            "Add between 0.0001 and 1,000,000 credits per request. Top-ups are unlimited.",
          );
        await ensureUser(db, user.id);
        await account(db, "system:issuance", null, "credit", true);
        await post(
          db,
          "top-up",
          `topup:${user.id}:${key}`,
          "Free test credits added",
          [
            ["system:issuance", -value],
            [cash(user.id), value],
          ],
        );
      } else if (path === "orders") {
        response = await placeOrder(
          db,
          user.id,
          z
            .object({
              marketId: z.string().max(100),
              outcome: z.enum(["yes", "no"]),
              side: z.enum(["buy", "sell"]),
              price: z.number().int().min(1).max(9999),
              quantity: z.number().int().min(1).max(100000),
              tif: z.enum(["GTC", "GTD", "FAK", "FOK"]),
              expiresAt: z.iso.datetime().optional(),
            })
            .parse(body),
        );
      } else if (path === "orders/cancel") {
        await cancelOrder(db, z.uuid().parse(body.id), user.id);
      } else if (path === "orders/cancel-all") {
        for (const o of (
          await db.query(
            "SELECT id FROM orders WHERE user_id=$1 AND state IN ('pending','open')",
            [user.id],
          )
        ).rows)
          await cancelOrder(db, o.id, user.id);
      } else if (path === "combos/quotes") {
        const input = z
          .object({ legs: z.array(legSchema).min(2).max(6), stake: z.string() })
          .parse(body);
        response = await quoteCombo(
          db,
          user.id,
          input.legs,
          units(input.stake),
        );
      } else if (path === "combos/accept")
        response = await acceptCombo(db, user.id, z.uuid().parse(body.id));
      else if (path === "combos/cashout-quote")
        response = await quoteCashout(db, user.id, z.uuid().parse(body.id));
      else if (path === "combos/cashout")
        response = await acceptCashout(db, user.id, z.uuid().parse(body.id));
      else if (path === "watchlist") {
        const id = z.string().max(100).parse(body.marketId);
        const removed = await db.query(
          "DELETE FROM watchlists WHERE user_id=$1 AND market_id=$2 RETURNING market_id",
          [user.id, id],
        );
        if (!removed.rowCount)
          await db.query(
            "INSERT INTO watchlists(user_id,market_id) VALUES($1,$2)",
            [user.id, id],
          );
      } else if (path === "comments") {
        const input = z
          .object({
            marketId: z.string().max(100),
            body: z.string().trim().min(1).max(1000),
          })
          .parse(body);
        await db.query(
          "INSERT INTO comments(market_id,user_id,body) VALUES($1,$2,$3)",
          [input.marketId, user.id, input.body],
        );
      } else if (path === "disputes") {
        const input = z
          .object({
            marketId: z.string().max(100),
            evidence: z.string().trim().min(10).max(2000),
          })
          .parse(body);
        const m = (
          await db.query("SELECT * FROM markets WHERE id=$1", [input.marketId])
        ).rows[0];
        if (
          !m ||
          !["proposed", "disputed"].includes(m.status) ||
          new Date(m.challenge_until).getTime() <= Date.now()
        )
          throw new Error("This market is not accepting disputes.");
        await db.query(
          "INSERT INTO disputes(market_id,user_id,evidence) VALUES($1,$2,$3)",
          [input.marketId, user.id, input.evidence],
        );
        await db.query("UPDATE markets SET status='disputed' WHERE id=$1", [
          input.marketId,
        ]);
      } else if (path.startsWith("admin/")) {
        if (user.role !== "admin") throw new Error("Admin access required.");
        if (path === "admin/markets") {
          const input = z
            .object({
              id: z.string().regex(/^[a-z0-9-]{3,80}$/),
              question: z.string().trim().min(10).max(200),
              description: z.string().trim().min(30).max(3000),
              category: z.enum([
                "Politics",
                "Sports",
                "Crypto",
                "Tech",
                "Economy",
                "Science",
                "Culture",
                "Weather",
              ]),
              closesAt: z.iso.datetime(),
              eventGroup: z.string().min(3).max(100),
              live: z.boolean(),
            })
            .parse(body);
          if (new Date(input.closesAt).getTime() <= Date.now())
            throw new Error("Close time must be in the future.");
          await db.query(
            "INSERT INTO markets(id,question,description,category,icon,closes_at,event_group,live) VALUES($1,$2,$3,$4,'🔮',$5,$6,$7)",
            [
              input.id,
              input.question,
              input.description,
              input.category,
              input.closesAt,
              input.eventGroup,
              input.live,
            ],
          );
        } else if (path === "admin/status") {
          const input = z
            .object({
              marketId: z.string(),
              status: z.enum(["open", "suspended"]),
            })
            .parse(body);
          const m = (
            await db.query("SELECT * FROM markets WHERE id=$1", [
              input.marketId,
            ])
          ).rows[0];
          if (!m || !["open", "suspended"].includes(m.status))
            throw new Error("This market cannot be reopened or suspended.");
          await clearMarket(db, input.marketId);
          await db.query(
            "UPDATE markets SET status=$2,updated_at=now() WHERE id=$1",
            [input.marketId, input.status],
          );
        } else if (path === "admin/propose") {
          const input = z
            .object({
              marketId: z.string(),
              result: z.enum(["yes", "no", "void"]),
              evidence: z.string().trim().min(10).max(2000),
            })
            .parse(body);
          const m = (
            await db.query("SELECT * FROM markets WHERE id=$1", [
              input.marketId,
            ])
          ).rows[0];
          if (!m || m.status === "settled")
            throw new Error("Market is already final or missing.");
          await clearMarket(db, input.marketId);
          const challenge = Math.max(
            0,
            Number(process.env.CHALLENGE_SECONDS ?? 7200),
          );
          if (!Number.isFinite(challenge))
            throw new Error("Invalid challenge window configuration.");
          await db.query(
            "UPDATE markets SET status='proposed',result=$2,evidence=$3,challenge_until=$4,updated_at=now() WHERE id=$1",
            [
              input.marketId,
              input.result,
              input.evidence,
              new Date(Date.now() + challenge * 1000),
            ],
          );
        } else if (path === "admin/finalize")
          await finalize(db, z.string().parse(body.marketId));
        else throw new Error("Unknown admin action.");
        await db.query(
          "INSERT INTO audit(actor_id,action,data) VALUES($1,$2,$3)",
          [user.id, path, JSON.stringify(body)],
        );
      } else throw new Error("Unknown action.");
      await db.query(
        "INSERT INTO commands(user_id,key,fingerprint,response) VALUES($1,$2,$3,$4)",
        [user.id, key, fingerprint, JSON.stringify(response)],
      );
      return response;
    });
    return json(result);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues[0]?.message ?? "Invalid request." },
        400,
      );
    if (error instanceof SyntaxError)
      return json({ error: "Invalid JSON." }, 400);
    const e = error as Error & { code?: string };
    if (e.code === "23505")
      return json({ error: "This record already exists." }, 409);
    if (
      e.code ||
      e.message === "DATABASE_UNAVAILABLE" ||
      /connect|ECONN/i.test(e.message)
    )
      return json(
        {
          error: "Database operation failed. Check PostgreSQL and migrations.",
        },
        503,
      );
    return json({ error: e.message || "Request failed." }, 400);
  }
}
