/* Prints the starter rules' backtests against DATABASE_URL (the same numbers /autopilot shows): npx tsx scripts/autopilot-backtest.ts */
import { getDb } from "@/lib/db";
import { backtest, backtestRows } from "@/lib/autopilot/backtest";
import { STARTERS } from "@/lib/autopilot/starters";
import { backtestLine } from "@/lib/autopilot/text";

async function main() {
  const now = Date.now(), t0 = Date.now();
  const rows = await backtestRows(getDb(), now);
  console.log(`${rows.length} recorded bets in the window, ${rows.filter(r => r.provenThen).length} by wallets proven then (read in ${Date.now() - t0}ms)`);
  for (const s of STARTERS) console.log(`${s.name}: ${backtestLine(backtest(s.spec, rows, now))}`);
  process.exit(0);
}
void main();
