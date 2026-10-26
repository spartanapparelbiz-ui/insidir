/* Seeds the END-TO-END TEST database (never a real one: refuses unless DATABASE_URL names an "e2e" database).
 * Every deal is computed by the real engines from synthetic books, and every title says "E2E fixture", so nothing
 * here can be mistaken for live data. Run: DATABASE_URL=…/terminal_e2e tsx qa/e2e/seed.ts */
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db";
import { DEFAULT_SETTINGS, fundFilings, fundHoldings, funds, insiderTrades, moves, nearMisses, opportunities, receipts, secHistory, sessions, traderPositions, traderRecords, users, whaleTrades, workerHeartbeats } from "@/lib/db/schema";
import { marketKey } from "@/lib/engines/common";
import { scan } from "@/lib/scanner";
import { saveMarkets } from "@/lib/worker/store";
import { dealClosed, dealFound, priceTick, publish, whale, type LiveRowInput } from "@/lib/live/publish";
import type { Book, Level, MarketPair, Opportunity, Plan, Region, VEvent, VMarket, Venue } from "@/lib/types";

const MIN = 60_000, DAY = 86_400_000;

export const E2E_USERS: Record<string, { id: string; plan: Plan; region: Region; token: string }> = {
  pro: { id: "user_e2e_pro", plan: "pro", region: "us", token: "e2e-pro-session-token-0000000000000000" },
  insidir: { id: "user_e2e_insidir", plan: "insidir", region: "us", token: "e2e-insidir-session-token-00000000000000" },
  freeUs: { id: "user_e2e_free", plan: "free", region: "us", token: "e2e-free-session-token-000000000000000000" },
  proIntl: { id: "user_e2e_pro_intl", plan: "pro", region: "non_us", token: "e2e-prointl-session-token-0000000000000" },
};

const L = (price: number, size: number): Level => ({ price, size });
function market(venue: Venue, id: string, over: Partial<VMarket> = {}): VMarket {
  return {
    venue, id, eventId: "EV-" + id, seriesId: null, title: `E2E fixture: market ${id}`, eventTitle: null, yesLabel: "Yes", noLabel: "No",
    rules: "E2E fixture rules.", resolutionSource: null, closeTime: Date.now() + 10 * DAY, category: "economics",
    fee: venue === "kalshi" ? { venue: "kalshi", multiplier: 1 } : { venue, rate: 0.05 },
    url: venue === "kalshi" ? `https://kalshi.com/markets/e2e/${id}` : venue === "polymarket" ? `https://polymarket.com/event/e2e-${id}` : `https://polymarket.us/market/e2e-${id}`, yesTokenId: null, noTokenId: null, strike: null, active: true, result: null, volume24h: null, ...over,
  };
}
const book = (yesAsks: Level[], noAsks: Level[], now: number): Book => ({ yesAsks, noAsks, yesBids: [], noBids: [], fetchedAt: now, hash: null });
function pair(a: VMarket, b: VMarket, over: Partial<MarketPair> = {}): MarketPair {
  return { id: `${a.venue}:${a.id}|${b.venue}:${b.id}`, a: { venue: a.venue, id: a.id }, b: { venue: b.venue, id: b.id }, inverted: false, method: "deterministic", confidence: 1, safety: "green", safetyNotes: [], blocked: false, ...over };
}

/** The synthetic universe. "fresh" deals were found just now; "old" ones 45 minutes ago (past the free delay). */
export function universe(now: number) {
  const m: VMarket[] = [], books = new Map<string, Book>(), pairs: MarketPair[] = [], events: VEvent[] = [];
  const add = (x: VMarket, b: Book) => { m.push(x); books.set(marketKey(x.venue, x.id), b); };
  const cross = (id: string, other: Venue, title: string, yes: number, no: number, size: number, days: number, safety: MarketPair["safety"] = "green") => {
    const close = now + days * DAY;
    const k = market("kalshi", `K-${id}`, { title, closeTime: close, category: "sports" });
    const p = market(other, `P-${id}`, { title, closeTime: close, category: "sports" });
    add(k, book([L(yes, size)], [L(1 - yes + 0.05, size)], now));
    add(p, book([L(1 - no + 0.05, size)], [L(no, size)], now));
    pairs.push(pair(k, p, safety === "green" ? {} : { safety, safetyNotes: ["E2E fixture: rules differ"] }));
  };
  // The hand-checked example: YES Kalshi 55¢ + NO Polymarket US 40¢, 100 sets, 10 days → $2.06 profit.
  cross("handcheck", "polymarket_us", "E2E fixture: Will the Hawks win on Nov 4?", 0.55, 0.40, 100, 10);
  cross("intl-fresh", "polymarket", "E2E fixture: Will the Fed cut in December? (intl)", 0.50, 0.44, 300, 20);
  cross("us-old", "polymarket_us", "E2E fixture: Will the Jets win on Nov 9?", 0.48, 0.47, 250, 5);
  cross("intl-old", "polymarket", "E2E fixture: Will BTC close above $100k on Nov 30? (intl)", 0.30, 0.66, 200, 30);
  cross("red-old", "polymarket_us", "E2E fixture: Will it snow in NYC on Dec 1? (rules differ)", 0.20, 0.70, 100, 8, "red");
  // A Kalshi-only multi-outcome set (all YES for 90¢).
  const ids = ["A", "B", "C"].map(x => `K-multi-${x}`);
  events.push({ venue: "kalshi", id: "EV-multi", title: "E2E fixture: Who wins the award?", category: "culture", marketIds: ids, mutuallyExclusive: true, exhaustive: true, closeTime: now + 15 * DAY });
  for (const id of ids) add(market("kalshi", id, { eventId: "EV-multi", title: `E2E fixture: Who wins the award? ${id.slice(-1)}`, closeTime: now + 15 * DAY, category: "culture", volume24h: 2_000 }), book([L(0.29, 80)], [L(0.75, 80)], now));
  return { markets: m, events, pairs, books };
}

function history(now: number) {
  const k = market("kalshi", "K-hist", { title: "E2E fixture: settled lock", category: "sports" });
  const p = market("polymarket_us", "P-hist", { title: "E2E fixture: settled lock", category: "sports" });
  const books = new Map<string, Book>([[marketKey(k.venue, k.id), book([L(0.45, 120)], [L(0.6, 120)], now)], [marketKey(p.venue, p.id), book([L(0.6, 120)], [L(0.51, 120)], now)]]);
  return { markets: [k, p], events: [] as VEvent[], pairs: [pair(k, p)], books };
}

const FRESH = new Set(["handcheck", "intl-fresh"]);
const ageOf = (o: Opportunity): number => (o.legs.some(l => [...FRESH].some(f => l.marketId.endsWith(f))) ? 0 : 45 * MIN);

export async function seed(): Promise<{ opps: Opportunity[] }> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/e2e/.test(new URL(url).pathname)) throw new Error(`Refusing to seed ${url}: not an e2e database`);
  const db = getDb();
  const now = Date.now();
  await db.execute(sql`TRUNCATE terminal.opportunities, terminal.receipts, terminal.whale_trades, terminal.worker_heartbeats, terminal.sessions, terminal.users, terminal.push_subscriptions, terminal.alerts_sent, terminal.events, terminal.webhook_events, terminal.live_events, terminal.near_misses, terminal.markets, terminal.moves, terminal.trader_records, terminal.follows, terminal.waitlist, terminal.trader_positions, terminal.tracked_wallets, terminal.insider_trades, terminal.sec_history, terminal.funds, terminal.fund_filings, terminal.fund_holdings CASCADE`);
  const u = universe(now);
  // The markets the last sweep saw (the landing page's "Scanning N markets" line counts these).
  await saveMarkets(db, u.markets);
  const { opps } = scan(u, u.books, now);
  // Second opinions double the cross-venue rows; the feed shows the lock, which is what the tests check.
  const deals = opps.filter(o => o.kind !== "second_opinion");
  for (const o of deals) {
    const first = new Date(now - ageOf(o));
    await db.insert(opportunities).values({ id: o.id, kind: o.kind, data: o, venues: [...new Set(o.legs.map(l => l.venue))], safety: o.safety, roi: o.roi, profitPerDay: o.profitPerDay, firstSeenAt: first, lastSeenAt: new Date(now), active: true });
    await db.insert(receipts).values({ oppId: o.id, kind: o.kind, safety: o.safety, detectedAt: first, snapshot: o });
  }
  // Settled history for the receipts page: one green Kalshi ↔ Polymarket US lock a day for the last 30 days
  // (its own prices, so its numbers never equal a live deal's).
  const h = history(now);
  const hist = scan(h, h.books, now).opps.find(o => o.kind === "cross_arb")!;
  for (let d = 1; d <= 30; d++) {
    const snap: Opportunity = { ...hist, id: `${hist.id}#hist${d}`, title: `E2E fixture: settled lock, day ${d}` };
    // Found at varied hours (the "when deals show up" heatmap), open for varied lengths (the "how long deals last"
    // histogram), and day 4 settled differently: a real loss, which the ledger shows with the same weight as a win.
    const at = new Date(now - d * DAY - ((d * 7) % 24) * 3_600_000);
    const lifeMin = [1, 3, 4, 6, 8, 12, 15, 25, 45, 90][d % 10]!;
    const lost = d === 4;
    const legKeys = snap.legs.map(l => `${l.venue}:${l.marketId}`);
    await db.insert(receipts).values({ oppId: snap.id, kind: snap.kind, safety: "green", detectedAt: at, snapshot: snap, settledAt: new Date(at.getTime() + DAY),
      results: Object.fromEntries(legKeys.map((k, i) => [k, lost && i === 0 ? "no" : "yes"])),
      sameWay: !lost, realizedProfit: lost ? -(snap.cost + snap.fees) : snap.profit });
    await db.insert(opportunities).values({ id: snap.id, kind: snap.kind, data: snap, venues: [...new Set(snap.legs.map(l => l.venue))], safety: snap.safety,
      roi: snap.roi, profitPerDay: snap.profitPerDay, firstSeenAt: at, lastSeenAt: new Date(at.getTime() + lifeMin * MIN), active: false });
  }
  // The live log, written by the same functions the worker uses: a "deal found" for each deal; one deal that closed
  // (found 20 minutes ago, gone 12 minutes later); a real price move on the Jets deal 40 minutes ago (the live state
  // follows it); and the big trade below.
  const live: LiveRowInput[] = deals.map(o => dealFound(o, new Date(now - ageOf(o))));
  const closed: Opportunity = { ...hist, id: "cross_arb-e2e-closed", title: "E2E fixture: Will the Bulls win on Nov 2?" };
  const cFirst = new Date(now - 20 * MIN), cLast = new Date(now - 8 * MIN);
  await db.insert(opportunities).values({ id: closed.id, kind: closed.kind, data: closed, venues: [...new Set(closed.legs.map(l => l.venue))], safety: closed.safety, roi: closed.roi, profitPerDay: closed.profitPerDay, firstSeenAt: cFirst, lastSeenAt: cLast, active: false });
  await db.insert(receipts).values({ oppId: closed.id, kind: closed.kind, safety: closed.safety, detectedAt: cFirst, snapshot: closed });
  live.push(dealFound(closed, cFirst), dealClosed(closed, cFirst, cLast, new Date(now - 7 * MIN)));
  const jets = deals.find(o => o.title.includes("Jets"))!;
  const moved: Opportunity = { ...jets, legs: jets.legs.map((l, i) => (i === 1 ? { ...l, avgPrice: l.avgPrice - 0.01, cost: l.cost - 0.01 * l.contracts } : l)),
    cost: jets.cost - 0.01 * jets.sets, profit: jets.profit + 0.01 * jets.sets };
  moved.roi = moved.profit / (moved.cost + moved.fees);
  moved.profitPerDay = moved.profit / moved.days;
  live.push(priceTick(jets, moved, new Date(now - 45 * MIN), new Date(now - 40 * MIN), new Map())!);
  await db.update(opportunities).set({ data: moved, roi: moved.roi, profitPerDay: moved.profitPerDay }).where(eq(opportunities.id, jets.id));
  for (const job of ["scan:kalshi", "scan:polymarket", "scan:polymarket_us"]) {
    await db.insert(workerHeartbeats).values({ job, lastRunAt: new Date(now), ok: true, error: null, stats: { books: 4 } });
  }
  const bigTrade = {
    venue: "polymarket" as const, wallet: "0xe2e0000000000000000000000000000000000001", name: null, marketId: "0xe2e", marketTitle: "E2E fixture: whale market",
    outcome: "Yes", side: "BUY" as const, contracts: 25_000, price: 0.62, cash: 15_500, timestamp: now - 35 * MIN, txHash: "0xe2e1", url: "https://example.test/whale",
  };
  await db.insert(whaleTrades).values({ key: "e2e-whale-1", at: new Date(bigTrade.timestamp), data: bigTrade });
  live.push(whale(bigTrade));
  await publish(db, live);
  // The closest matched market that isn't a deal (what the hero shows when there is no deal): 52¢ + 49¢ = 101¢.
  await db.insert(nearMisses).values({ venues: "kalshi|polymarket_us", at: new Date(now - 2 * MIN), data: {
    venues: ["kalshi", "polymarket_us"], pairId: "kalshi:E2E-KNICKS|polymarket_us:e2e-knicks", title: "E2E fixture: Will the Knicks win on Nov 6?",
    legs: [
      { venue: "kalshi", marketId: "E2E-KNICKS", side: "yes", label: "YES on Kalshi", priceCents: 52 },
      { venue: "polymarket_us", marketId: "e2e-knicks", side: "no", label: "NO on Polymarket US", priceCents: 49 },
    ],
    totalCents: 101, at: now - 2 * MIN,
  } });
  // V2 moves (test fixtures, labelled as such): a top trader, a wallet without a record, Kalshi moves, settled ones.
  const TOP = "0xe2e00000000000000000000000000000000000aa", NEW = "0xe2e00000000000000000000000000000000000bb", BRAND = "0xe2e00000000000000000000000000000000000cc";
  const mv = (o: Omit<Partial<typeof moves.$inferInsert>, "at" | "lastAt"> & { id: string; at: number }) => ({
    source: "polymarket" as const, marketId: "0xe2emarket1", eventTitle: "E2E fixture: Chiefs vs. Bills", marketTitle: "E2E fixture: Chiefs vs. Bills",
    outcome: "Chiefs", outcomeSide: "yes" as const, amount: 412_000, avgPrice: 0.62, wallet: TOP, walletName: "E2E-Top", fills: 3, tab: "sports" as const,
    league: "NFL", category: "sports", url: "https://polymarket.com/event/e2e-chiefs", ...o, at: new Date(o.at), lastAt: new Date(o.at + 2 * MIN),
  });
  await db.insert(moves).values([
    mv({ id: "e2e:m1", at: now - 4 * MIN }),
    mv({ id: "e2e:m2", at: now - 9 * MIN, source: "kalshi", marketId: "KXE2E-LAKERS", eventTitle: "E2E fixture: Lakers vs. Celtics", marketTitle: "E2E fixture: Lakers vs. Celtics winner?",
      outcome: "Lakers", amount: 48_000, avgPrice: 0.55, wallet: null, walletName: null, fills: 1, league: "NBA", url: "https://kalshi.com/markets/kxe2e" }),
    mv({ id: "e2e:m3", at: now - 50 * MIN, tab: "markets", category: "economics", league: null, marketId: "0xe2emarket2", eventTitle: "E2E fixture: Fed rate cut in December?",
      marketTitle: "E2E fixture: Fed rate cut in December?", outcome: "Yes", amount: 85_000, avgPrice: 0.31, wallet: NEW, walletName: null }),
    mv({ id: "e2e:m4", at: now - 3 * 60 * MIN, amount: 160_000, avgPrice: 0.48 }),
    // A wallet with no activity at all before this move.
    mv({ id: "e2e:m5", at: now - 40 * MIN, tab: "markets", category: "economics", league: null, marketId: "0xe2emarket3", eventTitle: "E2E fixture: Rate hike in March?",
      marketTitle: "E2E fixture: Rate hike in March?", outcome: "Yes", amount: 200_000, avgPrice: 0.2, wallet: BRAND, walletName: null, newWallet: true }),
    mv({ id: "e2e:s1", at: now - 3 * DAY, amount: 120_000, avgPrice: 0.4, result: "won", settledAt: new Date(now - 2 * DAY) }),
    mv({ id: "e2e:s2", at: now - 4 * DAY, amount: 64_000, avgPrice: 0.7, outcome: "Bills", outcomeSide: "no", result: "lost", settledAt: new Date(now - 3 * DAY) }),
    // Stocks (lib/stocks): a Form 4 insider buy and a 13F fund add, in the shapes the SEC jobs store.
    mv({ id: "f4:000099999926000001", at: now - 2 * DAY, source: "sec", marketId: "sec:0000999999", eventTitle: "E2E Fixture Devices", marketTitle: "EXDV",
      outcome: "Bought", amount: 1_401_811, avgPrice: 182.6464, wallet: null, walletName: null, fills: 2, tab: "stocks", league: null, category: "insider",
      url: "https://www.sec.gov/Archives/edgar/data/999999/000099999926000001/0000999999-26-000001-index.htm",
      detail: { kind: "insider", company: "E2E Fixture Devices", ticker: "EXDV", issuerCik: "0000999999", role: "The CEO", ownerName: "FIXTURE JANE", ownerCik: "0000888888",
        shares: 7675, pricePerShare: 182.6464, tradeDate: "2026-10-22", filedAt: now - 2 * DAY, accession: "000099999926000001" } }),
    mv({ id: "13f:000099999826000002:037833100", at: now - 5 * DAY, source: "sec", marketId: "cusip:037833100", eventTitle: "E2E Fixture Devices", marketTitle: "E2E Fixture Devices",
      outcome: "Added", amount: 250_000_000, avgPrice: 220, wallet: null, walletName: null, fills: 1, tab: "stocks", league: null, category: "fund",
      url: "https://www.sec.gov/Archives/edgar/data/999998/000099999826000002/0000999998-26-000002-index.htm",
      detail: { kind: "fund", company: "E2E Fixture Devices", cusip: "037833100", fund: "E2E Fixture Capital", fundCik: "0000999998", period: "2026-09-30", filedOn: "2026-10-21",
        addedShares: 1_136_364, prevShares: 4_000_000, curShares: 5_136_364, curValue: 1_130_000_080, newPosition: false, accession: "000099999826000002", prevAccession: "000099999826000001" } }),
  ]);
  await db.insert(traderRecords).values([
    { wallet: TOP, name: "E2E-Top", resolved: 63, won: 41, lost: 22, profit: 1_200_000, biggestWin: 310_000, biggestBet: 500_000, updatedAt: new Date(now) },
    { wallet: NEW, name: null, resolved: 7, won: 5, lost: 2, profit: 9_000, biggestWin: 4_000, biggestBet: 20_000, updatedAt: new Date(now) },
  ]);
  // E2E-Top's resolved positions, adding up to the record: 41 won (one of $310,000, forty of $27,750), 22 lost ($10,000 each).
  await db.insert(traderPositions).values(Array.from({ length: 63 }, (_, i) => ({
    wallet: TOP, marketId: `0xe2epos${i}`, outcomeIndex: 0, title: `E2E fixture market ${i}`, outcome: "Yes", eventSlug: null,
    category: i % 3 === 0 ? "Markets" : "NFL", tab: i % 3 === 0 ? "markets" as const : "sports" as const, moneyIn: 20_000,
    pnl: i === 0 ? 310_000 : i < 41 ? 27_750 : -10_000, resolvedAt: new Date(now - (200 - 3 * i) * DAY),
  })));
  // The insider's Form 4 lines (this filing, and a buy three years before) and their fully read SEC history.
  const f4 = (accession: string, line: number, tradeDate: string, shares: number, price: number, code: "P" | "S" = "P") => ({
    accession, line, ownerCik: "888888", ownerName: "FIXTURE JANE", role: "The CEO", issuerCik: "999999", company: "E2E Fixture Devices", ticker: "EXDV", code, tradeDate,
    shares, price, value: Math.round(shares * price * 100) / 100, filedAt: new Date(`${tradeDate}T21:00:00Z`),
    url: `https://www.sec.gov/Archives/edgar/data/999999/${accession}/${accession.slice(0, 10)}-${accession.slice(10, 12)}-${accession.slice(12)}-index.htm`,
  });
  await db.insert(insiderTrades).values([
    f4("000099999926000001", 0, "2026-10-22", 5000, 182.5), f4("000099999926000001", 1, "2026-10-22", 2675, 182.92),
    f4("000099999925000007", 0, "2025-05-02", 3000, 150, "S"), f4("000099999923000004", 0, "2023-06-01", 2000, 120),
  ]);
  await db.insert(secHistory).values([
    { kind: "owner", cik: "888888", name: "FIXTURE JANE", pending: [], completeSince: "2016-10-27" },
    { kind: "issuer", cik: "999999", name: "E2E Fixture Devices", pending: [], completeSince: "2016-10-27" },
  ]);
  // The fund's last two quarters, read in full.
  await db.insert(funds).values({ cik: "999998", name: "E2E Fixture Capital", quartersOnFile: 48, updatedAt: new Date(now) });
  const q13 = (accession: string, period: string, filedOn: string) => ({ fundCik: "999998", accession, period, filedOn, complete: true,
    url: `https://www.sec.gov/Archives/edgar/data/999998/${accession}/${accession.slice(0, 10)}-${accession.slice(10, 12)}-${accession.slice(12)}-index.htm` });
  await db.insert(fundFilings).values([q13("000099999826000002", "2026-09-30", "2026-10-21"), q13("000099999826000001", "2026-06-30", "2026-08-14")]);
  const hold = (accession: string, cusip: string, company: string, shares: number, value: number) => ({ fundCik: "999998", accession, cusip, company, shares, value });
  await db.insert(fundHoldings).values([
    hold("000099999826000001", "037833100", "E2E Fixture Devices", 4_000_000, 880_000_000), hold("000099999826000001", "111111111", "E2E Other Co", 1_000_000, 50_000_000),
    hold("000099999826000001", "222222222", "E2E Sold Co", 500_000, 20_000_000),
    hold("000099999826000002", "037833100", "E2E Fixture Devices", 5_136_364, 1_130_000_080), hold("000099999826000002", "111111111", "E2E Other Co", 500_000, 26_000_000),
    hold("000099999826000002", "333333333", "E2E New Co", 100_000, 30_000_000),
  ]);
  for (const job of ["moves:polymarket", "moves:kalshi"]) {
    await db.insert(workerHeartbeats).values({ job, lastRunAt: new Date(now), ok: true, error: null, stats: {} }).onConflictDoNothing();
  }
  for (const x of Object.values(E2E_USERS)) {
    await db.insert(users).values({ id: x.id, email: `${x.id}@example.test`, name: x.id, plan: x.plan, region: x.region, settings: DEFAULT_SETTINGS, // Plan already verified: no Whop call for seeded users (the checkout test covers the real Whop path).
      planCheckedAt: new Date(now + 365 * DAY), onboardedAt: new Date(now), membershipId: x.plan === "free" ? null : `mem_${x.id}` });
    await db.insert(sessions).values({ tokenHash: createHash("sha256").update(x.token).digest("hex"), userId: x.id, expiresAt: new Date(now + 30 * DAY) });
  }
  return { opps: deals };
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().then(async ({ opps }) => { console.log(`seeded ${opps.length} deals`); await closeDb(); }, async e => { console.error(e); await closeDb(); process.exit(1); });
}
