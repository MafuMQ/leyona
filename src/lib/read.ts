import { pool } from "./db";
import { fixtures } from "./fixtures";
export async function publicState() {
  try {
    const db = pool();
    const markets = (
      await db.query("SELECT * FROM markets ORDER BY live DESC,volume DESC,id")
    ).rows;
    return { mode: "connected", markets, notice: null };
  } catch {
    return {
      mode: "preview",
      markets: fixtures,
      notice:
        "Read-only preview. Connect and initialize local PostgreSQL to sign in and trade.",
    };
  }
}
export async function portfolio(user: string) {
  const db = pool();
  const balances = (
    await db.query(
      "SELECT id,balance FROM accounts WHERE owner_id=$1 AND asset='credit'",
      [user],
    )
  ).rows;
  const positions = (
    await db.query(
      `SELECT s.*,m.question,m.yes_price,m.status,m.result,
    COALESCE(a.balance,0)::text AS available,COALESCE(r.balance,0)::text AS reserved
    FROM position_stats s JOIN markets m ON m.id=s.market_id
    LEFT JOIN accounts a ON a.id='user:'||s.user_id||':'||s.market_id||':'||s.outcome||':available'
    LEFT JOIN accounts r ON r.id='user:'||s.user_id||':'||s.market_id||':'||s.outcome||':reserved'
    WHERE s.user_id=$1`,
      [user],
    )
  ).rows;
  const orders = (
    await db.query(
      "SELECT o.*,m.question FROM orders o JOIN markets m ON m.id=o.market_id WHERE user_id=$1 ORDER BY priority DESC LIMIT 100",
      [user],
    )
  ).rows;
  const combos = (
    await db.query(
      "SELECT * FROM combos WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [user],
    )
  ).rows;
  const activity = (
    await db.query(
      "SELECT j.id,j.kind,j.description,j.created_at,sum(e.amount)::text AS amount FROM journal j JOIN entries e ON e.journal_id=j.id JOIN accounts a ON a.id=e.account_id WHERE a.owner_id=$1 AND a.asset='credit' GROUP BY j.id ORDER BY j.created_at DESC LIMIT 50",
      [user],
    )
  ).rows;
  const issued = (
    await db.query(
      "SELECT COALESCE(sum(e.amount),0)::text AS value FROM entries e JOIN journal j ON j.id=e.journal_id JOIN accounts a ON a.id=e.account_id WHERE a.owner_id=$1 AND j.kind='top-up'",
      [user],
    )
  ).rows[0].value;
  return {
    balance: balances.find((b) => b.id.endsWith(":available"))?.balance ?? "0",
    reserved: balances.find((b) => b.id.endsWith(":reserved"))?.balance ?? "0",
    issued,
    positions,
    orders,
    combos,
    activity,
  };
}
export async function marketDetail(id: string) {
  const db = pool();
  const [book, trades, comments] = await Promise.all([
    db.query(
      "SELECT outcome,side,price,sum(remaining)::text AS quantity FROM orders WHERE market_id=$1 AND state='open' AND (expires_at IS NULL OR expires_at>now()) GROUP BY outcome,side,price ORDER BY price DESC",
      [id],
    ),
    db.query(
      "SELECT outcome,price,quantity,created_at FROM fills WHERE market_id=$1 ORDER BY created_at DESC LIMIT 40",
      [id],
    ),
    db.query(
      "SELECT c.id,c.body,c.created_at,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE market_id=$1 ORDER BY c.created_at DESC LIMIT 50",
      [id],
    ),
  ]);
  return { book: book.rows, trades: trades.rows, comments: comments.rows };
}
