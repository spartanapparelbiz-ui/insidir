/* Benchmarks the Price gaps matcher and live scanner on synthetic venues the size of production (no network):
 *   Kalshi: BENCH_KALSHI (130,000) open markets listed, ~20% over the activity floor
 *   Polymarket: BENCH_POLY (230,000) open markets in events, ~10% over the floor
 * Markets are generated page by page, the way the real clients deliver them, so nothing holds the full universe.
 * Runs the matcher three times (cold; nothing changed; 1% changed), then one live-scanner round over the targets with
 * synthetic books, and prints run time, peak memory and requests.
 *   DATABASE_URL=postgresql://…/terminal_bench npx tsx scripts/bench-match.ts */
import { closeDb, getDb } from "@/lib/db";
import { gapTargets, markets, matchCandidates, matchDecisions, matchKeys, matchRuns } from "@/lib/db/schema";
import type { KalshiEventInfo } from "@/lib/exchanges/kalshi";
import { LiveGaps, requestsFor } from "@/lib/gaps/live";
import { peakRssMb, runMatcher } from "@/lib/gaps/matcher";
import { DEFAULT_MATCH_CONFIG } from "@/lib/matching";
import { DEFAULT_SCAN_OPTIONS } from "@/lib/scanner";
import { dbMatchCache } from "@/lib/worker/store";
import type { Book, VEvent, VMarket } from "@/lib/types";

const KALSHI = Number(process.env.BENCH_KALSHI ?? 130_000);
const POLY = Number(process.env.BENCH_POLY ?? 230_000);
const DAY = 86_400_000, H = 3_600_000;
const BASE = Date.UTC(2026, 10, 1);
const NBA = ["Lakers", "Celtics", "Warriors", "Knicks", "Bulls", "Heat", "Suns", "Nuggets", "Bucks", "Sixers", "Mavericks", "Clippers", "Hawks", "Nets", "Raptors", "Kings", "Spurs", "Rockets", "Thunder", "Jazz"];
const PEOPLE = ["Trump", "Newsom", "Musk", "Powell", "Vance", "Harris", "Rubio", "Putin", "Zelensky", "Xi"];
const TOPICS = ["visit China", "tweet about Bitcoin", "attend the summit", "sign the bill", "meet the Pope", "announce a run", "speak at the UN", "appear on TV"];

function market(venue: VMarket["venue"], id: string, p: Partial<VMarket> & Pick<VMarket, "title">): VMarket {
  return {
    venue, id, eventId: p.eventId ?? id, eventTitle: p.eventTitle ?? null, yesLabel: p.yesLabel ?? "Yes", noLabel: p.noLabel ?? "No",
    category: p.category ?? "politics", seriesId: p.seriesId ?? null, closeTime: p.closeTime ?? null, active: true, rules: p.rules ?? "", resolutionSource: null,
    url: null, strike: p.strike ?? null, fee: venue === "kalshi" ? { venue: "kalshi", multiplier: 1 } : { venue: "polymarket", rate: 0 },
    volume24h: p.volume24h ?? 0, openInterest: p.openInterest ?? 0, ...p,
  } as VMarket;
}

/** The i-th synthetic market of a venue: NBA games (the same games on both venues), BTC strikes, and politics noise. */
function nth(venue: "kalshi" | "polymarket", i: number, version: number): VMarket {
  const kind = i % 10;
  const day = (i >> 4) % 60;
  const close = BASE + day * DAY + 23 * H;
  const date = new Date(close).toISOString().slice(0, 10);
  // Activity: Kalshi ~20% over the floor, Polymarket ~10%.
  // Every 70th Polymarket event (5 markets, mutually exclusive) trades as a whole: a multi-outcome set.
  const trading = venue === "kalshi" ? i % 5 === 0 : i % 10 === 0 || Math.floor(i / 5) % 70 === 0;
  const act = venue === "kalshi" ? { openInterest: trading ? 500 : 3 } : { volume24h: trading ? 5000 : 10 };
  const suffix = version ? ` (rev ${version})` : "";
  if (kind < 3) {
    const a = NBA[(i * 7) % NBA.length]!, b = NBA[(i * 7 + 3) % NBA.length]!;
    const title = venue === "kalshi" ? `${a} vs ${b} Winner? ${date}` : `${a} vs. ${b} on ${date}`;
    return market(venue, `${venue[0]}-nba-${i}`, { title: title + suffix, yesLabel: a, noLabel: b, category: "sports", closeTime: close, ...act });
  }
  if (kind < 6) {
    const v = 90_000 + (i % 40) * 1000;
    return market(venue, `${venue[0]}-btc-${i}`, {
      title: venue === "kalshi" ? `Bitcoin price on ${date} at 5pm EST?${suffix}` : `Will Bitcoin be above $${v.toLocaleString("en-US")} on ${date} at 5pm ET?${suffix}`,
      yesLabel: venue === "kalshi" ? `$${v.toLocaleString("en-US")} or above` : "Yes", category: "crypto", closeTime: close,
      strike: venue === "kalshi" ? { kind: "above", value: v - 0.01, upper: null, subject: "btc" } : null, ...act,
    });
  }
  return market(venue, `${venue[0]}-pol-${i}`, { title: `Will ${PEOPLE[i % PEOPLE.length]} ${TOPICS[(i >> 3) % TOPICS.length]} by ${date}?${suffix}`, category: "politics", closeTime: close, ...act });
}

function fakeClients(version: (i: number) => number) {
  const events = new Map<string, KalshiEventInfo>();
  return {
    kalshi: {
      async listOpenEventInfos() { return events; },
      async *marketPages() {
        for (let p = 0; p * 1000 < KALSHI; p++) {
          const ms: VMarket[] = [];
          for (let i = p * 1000; i < Math.min(KALSHI, (p + 1) * 1000); i++) ms.push(nth("kalshi", i, version(i)));
          yield { markets: ms, raw: ms.length, eventTickers: ms.map(m => m.eventId) };
        }
      },
    },
    polymarket: {
      async *eventPages() {
        // 100 events per page, ~5 markets per event (some multi-outcome).
        let i = 0;
        while (i < POLY) {
          const page: Array<{ event: VEvent; markets: VMarket[] }> = [];
          for (let e = 0; e < 100 && i < POLY; e++) {
            const ms: VMarket[] = [];
            for (let k = 0; k < 5 && i < POLY; k++, i++) ms.push(nth("polymarket", i, version(i)));
            page.push({ event: { venue: "polymarket", id: `ev-${i}`, title: ms[0]!.title, category: ms[0]!.category, marketIds: ms.map(m => m.id), mutuallyExclusive: Math.floor((i - 1) / 5) % 70 === 0, exhaustive: false, closeTime: ms[0]!.closeTime }, markets: ms });
          }
          yield page;
        }
      },
    },
    polymarketUs: null,
  };
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function main() {
  const db = getDb();
  for (const t of [gapTargets, matchKeys, matchCandidates, markets, matchDecisions, matchRuns]) await db.delete(t);
  const base = peakRssMb();
  console.log(`synthetic: ${KALSHI.toLocaleString()} Kalshi + ${POLY.toLocaleString()} Polymarket markets listed; process baseline ${base} MB`);
  const deps = (v: (i: number) => number) => ({
    db, clients: fakeClients(v), floor: { minVolumeUsd: 100, minOpenInterest: 100 }, config: DEFAULT_MATCH_CONFIG,
    cache: dbMatchCache(db), overrides: new Map(), now: Date.now(), log: (m: string) => console.log("  " + m),
  });
  const runs: Array<[string, (i: number) => number]> = [["cold (every market new)", () => 0], ["nothing changed", () => 0], ["1% changed", i => (i % 100 === 0 ? 1 : 0)]];
  for (const [label, v] of runs) {
    const s = await runMatcher(deps(v));
    console.log(`matcher, ${label}: ${fmt(s.ms)}, peak RSS ${s.peakRssMb} MB; kept ${s.seen.kalshi} + ${s.seen.polymarket}, changed ${s.changed.kalshi} + ${s.changed.polymarket}, ` +
      `re-scored ${s.rescored}, ${s.candidates} candidates, ${s.pairs} pairs + ${s.multi} multi = ${s.targets} targets`);
  }

  // Live scanner: one heap snapshot before and after loading the targets and a round of books.
  globalThis.gc?.();
  const heap0 = process.memoryUsage().heapUsed, rss0 = process.memoryUsage().rss;
  const book = (): Book => ({ yesAsks: [{ price: 0.52, size: 500 }], noAsks: [{ price: 0.53, size: 500 }], yesBids: [{ price: 0.48, size: 500 }], noBids: [{ price: 0.47, size: 500 }], fetchedAt: Date.now(), hash: null });
  const fakeBooks = { getBooks: async (ms: readonly VMarket[]) => new Map(ms.map(m => [m.id, book()])) };
  const live = new LiveGaps(db, { kalshi: fakeBooks, polymarket: fakeBooks, polymarket_us: fakeBooks }, DEFAULT_SCAN_OPTIONS);
  const tl = Date.now();
  await live.refresh(Date.now(), true);
  const r = await live.round(Date.now());
  globalThis.gc?.();
  const heap1 = process.memoryUsage().heapUsed, rss1 = process.memoryUsage().rss;
  const need = (live as unknown as { need: Map<"kalshi" | "polymarket", VMarket[]> }).need;
  console.log(`live scanner: ${live.size.targets} targets, ${live.size.markets} markets, ${r.books} books per round in ${fmt(Date.now() - tl)}; ` +
    `${requestsFor(need)} requests per round = ${requestsFor(need) * 6} per minute; heap +${((heap1 - heap0) / 1e6).toFixed(1)} MB, RSS +${((rss1 - rss0) / 1e6).toFixed(1)} MB`);
  await closeDb();
}

main().catch(e => { console.error(e); process.exit(1); });
