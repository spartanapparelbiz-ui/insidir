/* One-shot live scan report (`npm run scan`). No database needed: it lists every venue, matches Kalshi ↔ Polymarket
 * (and ↔ Polymarket US) with an in-memory cache, fetches the books the engines need, runs every engine once and
 * prints:
 *   - the top 10 opportunities with each leg's fillable size, average price, fee, and the profit math
 *   - how many pairs matched and how many were GREEN / YELLOW / RED
 *   - false positives caught (candidates rejected, RED pairs, with the reasons)
 *   - rate-limit headroom per venue bucket (429s seen)
 *   - an estimated monthly running cost
 * Flags: --top N (default 10), --json (machine-readable). Set OPENROUTER_API_KEY to let unsure matches ask the LLM. */
import { createVenueClients, rateLimitStats, type VenueClient } from "@/lib/exchanges";
import { appendAll } from "@/lib/exchanges/venue";
import { marketKey } from "@/lib/engines/common";
import { createMemoryCache, createMemoryUsageStore, createOpenRouterConfirm, llmEnv, matchConfigFromEnv, matchMarkets, type MatchStats } from "@/lib/matching";
import { marketsToBook, scan } from "@/lib/scanner";
import { playText } from "@/lib/feed";
import { days, pct, usd } from "@/lib/format";
import { VENUE_NAME, type Book, type MarketPair, type Opportunity, type VEvent, type VMarket, type Venue } from "@/lib/types";

const args = process.argv.slice(2);
const topArg = args.includes("--top") ? Number(args[args.indexOf("--top") + 1]) : NaN;
const TOP = Number.isInteger(topArg) && topArg > 0 ? topArg : 10;
const JSON_OUT = args.includes("--json");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const say = (...a: unknown[]) => { if (!JSON_OUT) console.log(...a); };

/** Rough Railway + services cost, in USD a month. Railway bills usage; these are the sizes we expect at launch. */
export const COST_ESTIMATE = {
  railwayWeb: 5, // Next.js, ~0.5 vCPU / 512 MB average
  railwayWorker: 10, // always-on loop, ~0.5 vCPU / 1 GB
  railwayPostgres: 5, // < 1 GB, light IO
  resend: 0, // free tier: 3,000 emails/month, 100/day
  webPush: 0, // VAPID push is free
} satisfies Record<string, number>;

function legLine(o: Opportunity): string[] {
  return o.legs.map(l => `    ${l.side.toUpperCase()} ${VENUE_NAME[l.venue]} "${l.label}": ${l.contracts} @ avg ${(l.avgPrice * 100).toFixed(1)}¢ (worst ${(l.worstPrice * 100).toFixed(1)}¢) = ${usd(l.cost)} + fee ${usd(l.fee)}`);
}

async function main(): Promise<void> {
  const started = Date.now();
  const clients = createVenueClients();
  const markets: VMarket[] = [], events: VEvent[] = [];
  const byVenue = new Map<Venue, VMarket[]>();
  const venueErrors: Record<string, string> = {};
  for (const [venue, client] of Object.entries(clients) as Array<[Venue, VenueClient]>) {
    try {
      const [m, e] = await Promise.all([client.listMarkets({ refresh: true }), client.listEvents()]);
      appendAll(markets, m); appendAll(events, e); byVenue.set(venue, m);
      say(`${VENUE_NAME[venue]}: ${m.length} open markets, ${e.length} events`);
    } catch (e) {
      venueErrors[venue] = errMsg(e);
      say(`${VENUE_NAME[venue]}: FAILED (${errMsg(e)})`);
    }
  }

  const env = llmEnv(process.env);
  const usage = createMemoryUsageStore();
  const deps = {
    cache: createMemoryCache(), overrides: new Map(), now: Date.now(), config: matchConfigFromEnv(process.env),
    llm: env.apiKey ? createOpenRouterConfirm({ apiKey: env.apiKey, model: env.model, monthlyCapUsd: env.monthlyCapUsd, usage, now: () => Date.now(), appUrl: process.env.APP_URL ?? "https://insidir.com" }) : undefined,
  };
  const pairs: MarketPair[] = [];
  const matchStats: Record<string, MatchStats> = {};
  const kalshi = byVenue.get("kalshi") ?? [];
  for (const other of ["polymarket", "polymarket_us"] as const) {
    const list = byVenue.get(other) ?? [];
    if (!kalshi.length || !list.length) continue;
    const r = await matchMarkets(kalshi, list, deps);
    appendAll(pairs, r.pairs);
    matchStats[other] = r.stats;
  }

  const universe = { markets, events, pairs };
  const books = new Map<string, Book>();
  for (const [venue, list] of marketsToBook(universe)) {
    try {
      for (const [id, b] of await clients[venue].getBooks(list, { priority: "normal" })) books.set(marketKey(venue, id), b);
    } catch (e) { venueErrors[`${venue}:books`] = errMsg(e); }
  }
  const { opps, counts } = scan(universe, books, Date.now());
  const top = opps.slice(0, TOP);
  const redPairs = pairs.filter(p => p.safety === "red");
  const limits = rateLimitStats();
  const llmSpend = Object.values(matchStats).reduce((s, x) => s + x.llmCostUsd, 0);
  // The worker re-matches every 5 minutes but only asks the LLM about new candidates (decisions are cached), so a
  // full first run is the worst case; new listings cost a small fraction of that each month.
  const llmMonthly = Math.min(env.monthlyCapUsd, llmSpend * 3);
  const monthly = Object.values(COST_ESTIMATE).reduce((s: number, x: number) => s + x, 0) + llmMonthly;

  if (JSON_OUT) {
    console.log(JSON.stringify({ at: new Date().toISOString(), tookMs: Date.now() - started, venueErrors, markets: markets.length, books: books.size, counts, matchStats, pairs: pairs.length, redPairs: redPairs.length, top, limits, monthlyUsd: monthly }, null, 2));
    return;
  }

  say(`\nBooks fetched: ${books.size}. Deals found: ${opps.length} (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  say(`\n=== Top ${top.length} by profit per day (taker fills, after fees) ===`);
  top.forEach((o, i) => {
    say(`\n${i + 1}. [${o.safety.toUpperCase()}] ${o.kind} · ${o.title}`);
    say(`   ${playText(o)}`);
    for (const l of legLine(o)) say(l);
    say(`   ${o.sets} sets: cost ${usd(o.cost)} + fees ${usd(o.fees)} = ${usd(o.cost + o.fees)} → pays ${usd(o.payout)} → profit ${usd(o.profit)} (${pct(o.roi, 2)})`);
    say(`   resolves in ${days(o.days)} → ${usd(o.profitPerDay)}/day${o.safetyNotes.length ? `\n   notes: ${o.safetyNotes.join("; ")}` : ""}`);
  });
  if (!top.length) say("(none right now)");

  say(`\n=== Matching ===`);
  for (const [other, s] of Object.entries(matchStats)) {
    say(`Kalshi ↔ ${VENUE_NAME[other as Venue]}: ${s.candidates} candidates → ${s.green + s.yellow + s.red} pairs (GREEN ${s.green}, YELLOW ${s.yellow}, RED ${s.red}); LLM asked ${s.llmAsked}, accepted ${s.llmAccepted}, unsure ${s.unsure}; rejected ${s.rejected}; cost ${usd(s.llmCostUsd)}`);
  }
  say(`\n=== False positives caught ===`);
  say(`Candidates rejected as different questions: ${Object.values(matchStats).reduce((s, x) => s + x.rejected, 0)}`);
  say(`Pairs marked RED (rules differ; hidden by default): ${redPairs.length}`);
  for (const p of redPairs.slice(0, 10)) say(`  - ${p.a.id} ↔ ${p.b.id}: ${p.safetyNotes.join("; ")}`);

  say(`\n=== Rate limits ===`);
  for (const [name, s] of Object.entries(limits)) {
    if (!s.requests) continue;
    say(`${name}: ${s.requests} requests, ${s.rateLimited} × 429, ${s.retries} retries, ${s.failures} failures; budget ${s.ratePerSec}/s (published ${s.published})`);
  }
  if (Object.keys(venueErrors).length) say(`\nErrors: ${JSON.stringify(venueErrors)}`);

  say(`\n=== Estimated monthly cost ===`);
  for (const [k, v] of Object.entries(COST_ESTIMATE)) say(`${k}: ${usd(v)}`);
  say(`OpenRouter matching (capped at ${usd(env.monthlyCapUsd)}): ~${usd(llmMonthly)}`);
  say(`Total: ~${usd(monthly)}/month, plus Whop's fee on each payment.`);
  say(`\nTook ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
