/* Read-only: sweeps both venues live, pairs markets (lib/twins/check.ts) and prints the ones that would approve
 * themselves from structured data (lib/twins/structured.ts). Writes nothing.
 *   npx tsx scripts/twins-dry.ts */
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { findTwins } from "@/lib/twins/check";
import { autoCheck } from "@/lib/twins/structured";

async function main() {
  const [poly, kalshi] = await Promise.all([new PolymarketClient().listMarkets(), new KalshiClient().listMarkets()]);
  const now = Date.now();
  const live = (m: { active?: boolean; closeTime?: number | null }) => m.active !== false && (!m.closeTime || m.closeTime > now - 86_400_000);
  const twins = findTwins(poly.filter(live), kalshi.filter(live));
  const auto = twins.filter(t => t.result.verdict === "candidate" && autoCheck(t.poly, t.kalshi).auto);
  console.log(`swept ${poly.length} Polymarket, ${kalshi.length} Kalshi markets; ${twins.length} twins found, ${auto.length} approve themselves`);
  for (const t of auto) console.log(`${autoCheck(t.poly, t.kalshi).kind}\t${t.poly.title}\t↔\t${t.kalshi.title}\t(${t.kalshi.id})`);
}

main().catch(e => { console.error(e); process.exit(1); });
