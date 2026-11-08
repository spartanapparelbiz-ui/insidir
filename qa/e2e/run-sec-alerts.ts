/* Plays the worker's watchlist-alert job once against the e2e database (lib/stocks/watchlists.ts alertsOnce) and
 * prints its result as JSON. Run by qa/e2e/sec-terminal.spec.ts. Test use only. */
import { closeDb, getDb } from "@/lib/db";
import { alertsOnce } from "@/lib/stocks/watchlists";

async function main() {
  if (!/e2e/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing: not an e2e database");
  console.log(JSON.stringify(await alertsOnce(getDb(), Date.now())));
  await closeDb();
}
main().catch(e => { console.error(e); process.exit(1); });
