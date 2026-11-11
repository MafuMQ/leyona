import "./env";
import { pool } from "../src/lib/db";
export async function reconcile() {
  const db = pool();
  const errors: string[] = [];
  const balances = await db.query(
    "SELECT a.id FROM accounts a LEFT JOIN entries e ON e.account_id=a.id GROUP BY a.id HAVING a.balance<>COALESCE(sum(e.amount),0)",
  );
  if (balances.rowCount)
    errors.push(`${balances.rowCount} account balance mismatches`);
  const journals = await db.query(
    "SELECT e.journal_id,a.asset FROM entries e JOIN accounts a ON a.id=e.account_id GROUP BY e.journal_id,a.asset HAVING sum(e.amount)<>0",
  );
  if (journals.rowCount)
    errors.push(`${journals.rowCount} unbalanced journals`);
  const reserved = await db.query(
    `SELECT a.id FROM accounts a WHERE a.id LIKE '%:credit:reserved' AND a.balance<>(SELECT COALESCE(sum(o.remaining::bigint*o.price),0) FROM orders o WHERE o.user_id=a.owner_id AND o.side='buy' AND o.state IN ('pending','open'))`,
  );
  if (reserved.rowCount)
    errors.push(`${reserved.rowCount} credit reservation mismatches`);
  const inventory = await db.query(
    `SELECT a.id FROM accounts a WHERE a.asset<>'credit' AND a.owner_id IS NOT NULL AND a.id LIKE '%:reserved' AND a.balance<>(SELECT COALESCE(sum(o.remaining),0) FROM orders o WHERE o.user_id=a.owner_id AND o.market_id||':'||o.outcome=a.asset AND o.side='sell' AND o.state IN ('pending','open'))`,
  );
  if (inventory.rowCount)
    errors.push(`${inventory.rowCount} inventory reservation mismatches`);
  const collateral = await db.query(
    `SELECT m.id FROM markets m LEFT JOIN accounts c ON c.id='collateral:'||m.id WHERE COALESCE(c.balance,0)<>(SELECT COALESCE(sum(a.balance),0)*CASE WHEN m.status='settled' THEN 0 ELSE 10000 END FROM accounts a WHERE a.asset=m.id||':yes' AND a.owner_id IS NOT NULL)`,
  );
  if (collateral.rowCount)
    errors.push(`${collateral.rowCount} binary collateral mismatches`);
  const combos = await db.query(
    "SELECT c.id FROM combos c LEFT JOIN accounts a ON a.id='combo:'||c.id WHERE COALESCE(a.balance,0)<>CASE WHEN c.state='open' THEN c.payout ELSE 0 END",
  );
  if (combos.rowCount)
    errors.push(`${combos.rowCount} combo collateral mismatches`);
  if (errors.length) throw new Error(errors.join("; "));
  console.log(
    "Reconciliation passed: balances, journals, reservations and collateral agree.",
  );
}
reconcile()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
