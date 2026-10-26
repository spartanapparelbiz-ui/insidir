/* Seeds the END-TO-END TEST database (never a real one: refuses unless DATABASE_URL names an "e2e" database).
 * Every deal is computed by the real engines from synthetic books, and every title says "E2E fixture", so nothing
 * here can be mistaken for live data. Run: DATABASE_URL=…/terminal_e2e tsx qa/e2e/seed.ts */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db";
import { DEFAULT_SETTINGS, opportunities, receipts, sessions, users, whaleTrades, workerHeartbeats } from "@/lib/db/schema";
import { marketKey } from "@/lib/engines/common";
import { scan } from "@/lib/scanner";
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
    url: `https://example.test/${venue}/${id}`, yesTokenId: null, noTokenId: null, strike: null, active: true, result: null, volume24h: null, ...over,
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
  for (const id of ids) add(market("kalshi", id, { eventId: "EV-multi", title: `E2E fixture: Who wins the award? ${id.slice(-1)}`, closeTime: now + 15 * DAY, category: "culture" }), book([L(0.29, 80)], [L(0.75, 80)], now));
  return { markets: m, events, pairs, books };
}

const FRESH = new Set(["handcheck", "intl-fresh"]);
const ageOf = (o: Opportunity): number => (o.legs.some(l => [...FRESH].some(f => l.marketId.endsWith(f))) ? 0 : 45 * MIN);

export async function seed(): Promise<{ opps: Opportunity[] }> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/e2e/.test(new URL(url).pathname)) throw new Error(`Refusing to seed ${url}: not an e2e database`);
  const db = getDb();
  const now = Date.now();
  await db.execute(sql`TRUNCATE terminal.opportunities, terminal.receipts, terminal.whale_trades, terminal.worker_heartbeats, terminal.sessions, terminal.users, terminal.push_subscriptions, terminal.alerts_sent, terminal.events, terminal.webhook_events CASCADE`);
  const u = universe(now);
  const { opps } = scan(u, u.books, now);
  // Second opinions double the cross-venue rows; the feed shows the lock, which is what the tests check.
  const deals = opps.filter(o => o.kind !== "second_opinion");
  for (const o of deals) {
    const first = new Date(now - ageOf(o));
    await db.insert(opportunities).values({ id: o.id, kind: o.kind, data: o, venues: [...new Set(o.legs.map(l => l.venue))], safety: o.safety, roi: o.roi, profitPerDay: o.profitPerDay, firstSeenAt: first, lastSeenAt: new Date(now), active: true });
    await db.insert(receipts).values({ oppId: o.id, kind: o.kind, safety: o.safety, detectedAt: first, snapshot: o });
  }
  // Settled history for the receipts page: one green Kalshi ↔ Polymarket US lock a day for the last 30 days.
  const hist = deals.find(o => o.legs.some(l => l.marketId === "K-us-old"))!;
  for (let d = 1; d <= 30; d++) {
    const snap: Opportunity = { ...hist, id: `${hist.id}#hist${d}`, title: `E2E fixture: settled lock, day ${d}` };
    const at = new Date(now - d * DAY);
    await db.insert(receipts).values({ oppId: snap.id, kind: snap.kind, safety: "green", detectedAt: at, snapshot: snap, settledAt: new Date(at.getTime() + DAY), results: {}, sameWay: true, realizedProfit: snap.profit });
  }
  for (const job of ["scan:kalshi", "scan:polymarket", "scan:polymarket_us"]) {
    await db.insert(workerHeartbeats).values({ job, lastRunAt: new Date(now), ok: true, error: null, stats: { books: 4 } });
  }
  await db.insert(whaleTrades).values({ key: "e2e-whale-1", at: new Date(now - 5 * MIN), data: {
    venue: "polymarket", wallet: "0xe2e0000000000000000000000000000000000001", name: null, marketId: "0xe2e", marketTitle: "E2E fixture: whale market",
    outcome: "Yes", side: "BUY", contracts: 25_000, price: 0.62, cash: 15_500, timestamp: now - 5 * MIN, txHash: "0xe2e1", url: "https://example.test/whale",
  } });
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
