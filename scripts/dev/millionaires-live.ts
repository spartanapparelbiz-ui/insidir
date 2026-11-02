/* Dev only: fills a local database with real millionaire data from the live venues, for previewing the pages.
 * Refreshes the watchlist from Polymarket's leaderboard, polls moves (with the watchlist) `--polls` times, 20 s apart,
 * then reads market prices. Never run against production: it refuses a DATABASE_URL that isn't on localhost.
 *   DATABASE_URL=postgresql://…localhost…/terminal npx tsx scripts/dev/millionaires-live.ts --polls 6 */
import { getDb } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { marketInfoOnce } from "@/lib/markets/info";
import { refreshWatchlist, WatchCache } from "@/lib/millionaires/watchlist";
import { MarketDirectory } from "@/lib/moves/directory";
import { movesOnce, movesPoller } from "@/lib/moves/jobs";

async function main() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("dev only: DATABASE_URL must be local");
  const polls = Number(process.argv[process.argv.indexOf("--polls") + 1] || 3);
  const db = getDb(), poly = new PolymarketClient(), kalshi = new KalshiClient();
  const w = await refreshWatchlist(db, poly, Date.now());
  console.log("watchlist", w);
  const watch = new WatchCache(), poller = movesPoller(poly, kalshi, watch), dir = new MarketDirectory(db, { polymarket: poly, kalshi });
  for (let i = 0; i < polls; i++) {
    const fresh = await movesOnce(db, poller, dir, Date.now(), async (job, ok, err) => { if (!ok) console.log(job, err); }, watch);
    console.log(`poll ${i + 1}: ${fresh.length} moves, ${poller.lastWatchedBets().length} watchlist bets`);
    if (i < polls - 1) await new Promise(r => setTimeout(r, 20_000));
  }
  console.log("prices", await marketInfoOnce(db, { polymarket: poly, kalshi }, Date.now()));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
