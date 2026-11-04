/* Records real market pairs from both venues (normalised with the repo's own readers) as test fixtures for the twin
 * checks: an NBA moneyline, its spreads and totals, the Fed's December decision and the Florida governor race.
 *   npx tsx scripts/twin-fixtures.ts [kalshiEventTicker=polymarketEventSlug ...]
 * Writes test/fixtures/twins/<name>.json: { kalshi: VMarket[], polymarket: VMarket[] }. */
import { mkdirSync, writeFileSync } from "node:fs";
import { KalshiClient } from "@/lib/exchanges";
import { readGammaEvent } from "@/lib/exchanges/polymarket";

const DEFAULTS = [
  "nba-moneyline:KXNBAGAME-26NOV04ATLWAS=nba-atl-was-2026-11-04",
  "nba-spread:KXNBASPREAD-26NOV04ATLWAS=nba-atl-was-2026-11-04",
  "nba-total:KXNBATOTAL-26NOV04ATLWAS=nba-atl-was-2026-11-04",
  "fed-december:KXFEDDECISION-26DEC=fed-decision-in-december",
  "florida-governor:GOVPARTYFL-26=florida-governor-election-winner",
];

async function gamma(slug: string): Promise<unknown | null> {
  const r = await fetch(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`);
  const j = await r.json() as unknown[];
  return Array.isArray(j) && j.length ? j[0] : null;
}

async function main() {
  const kalshi = new KalshiClient();
  mkdirSync("test/fixtures/twins", { recursive: true });
  for (const spec of process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS) {
    const [name, pair] = spec.split(":");
    const [ticker, slug] = pair!.split("=");
    const k = await kalshi.getEvent(ticker!).catch(e => { console.error(ticker, e); return null; });
    const raw = await gamma(slug!);
    const p = raw ? readGammaEvent(raw) : null;
    const out = { recordedAt: new Date().toISOString(), kalshi: k?.markets ?? [], polymarket: p?.markets ?? [] };
    writeFileSync(`test/fixtures/twins/${name}.json`, JSON.stringify(out, null, 1));
    console.log(name, "kalshi", out.kalshi.length, "polymarket", out.polymarket.length, out.kalshi.slice(0, 3).map(m => m.title), out.polymarket.slice(0, 3).map(m => m.title));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
