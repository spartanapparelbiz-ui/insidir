/* Trackers (lib/trackers.ts): each rule, the stored tags and re-tagging, observed tags (Steam, Early / Late money),
 * cluster buys, the record and its "New" floor, the rankings, follows, alerts, and (with an e2e database) that every
 * tracker's stored or SQL rule picks exactly the moves its pure rule does, and the record matches. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { parseFollow } from "@/lib/follows";
import { alertJobs, alertMessage, reasonFor, type AlertUser } from "@/lib/moves/alerts";
import type { Move } from "@/lib/moves/types";
import {
  clusterIssuers, FEATURED, fixedTags, GROUPS, hasTrackerRecord, isFixed, isLive, isObserved, isTrackerSlug, observedTags, popular, recordPill, retag, topPerformers,
  TRACKER_MIN_SETTLED, trackerBySlug, TRACKERS, trackersOf, visibleTrackers, winPct, type TrackerCtx, type TrackerRecord,
} from "@/lib/trackers";
import { recordOf, countsToRecord } from "@/lib/trust";

const NOW = Date.UTC(2026, 9, 29, 12);
const H = 3_600_000, DAY = 86_400_000;
const TOP = "0x" + "a".repeat(40), OTHER = "0x" + "b".repeat(40);
const ctx: TrackerCtx = { topTrader: w => w === TOP, topPct: w => w === TOP, cluster: () => false };

let n = 0;
function mv(over: Partial<Move> = {}): Move {
  n++;
  return {
    id: `pm:test:${n}`, source: "polymarket", marketId: `m${n}`, eventTitle: "Lakers vs. Celtics", marketTitle: "Lakers vs. Celtics", outcome: "Lakers",
    outcomeSide: "yes", amount: 20_000, avgPrice: 0.5, wallet: OTHER, walletName: null, at: NOW - H, lastAt: NOW - H, fills: 1, tab: "sports", league: "NBA",
    category: "sports", url: null, result: null, settledAt: null, newWallet: false, pnl: null, soldShare: 0, trackers: null, ...over,
  };
}
const insider = (role: string, over: { issuerCik?: string; owner?: string; at?: number } = {}): Move => mv({ source: "sec", tab: "stocks", league: null, category: "insider", wallet: null,
  amount: 500_000, at: over.at ?? NOW - H, marketId: `sec${n}`,
  detail: { kind: "insider", company: "Example Corp", ticker: "EXC", issuerCik: over.issuerCik ?? "1", role, ownerName: over.owner ?? `Owner ${n}`, ownerCik: "2", shares: 1000, pricePerShare: 500, tradeDate: "2026-10-20", filedAt: NOW, accession: `a${n}` } });
const fund = (newPosition = true): Move => mv({ source: "sec", tab: "stocks", league: null, category: "fund", wallet: null, amount: 9_000_000, marketId: `f${n}`,
  detail: { kind: "fund", company: "Example Corp", cusip: "123", fund: "Big Fund", fundCik: "3", period: "2026-09-30", filedOn: "2026-10-28", addedShares: 10, prevShares: newPosition ? 0 : 5, curShares: 10, curValue: 9_000_000, newPosition, accession: `x${n}`, prevAccession: "y" } });
const game = (eventTitle: string, over: Partial<Move> = {}) => mv({ eventTitle, marketTitle: eventTitle, league: null, ...over });
const topic = (t: string, category: string) => mv({ tab: "markets", league: null, category, eventTitle: t, marketTitle: t });

describe("the catalogue", () => {
  it("every tracker the brief lists, unique slugs, a group and a cover each; four featured", () => {
    for (const name of ["NFL", "NBA", "MLB", "NHL", "College Football", "College Basketball", "Premier League", "Champions League",
      "La Liga", "Serie A", "UFC", "Tennis", "Golf", "Esports", "Fed & Rates", "Elections 2026", "Crypto Prices", "Geopolitics", "Tech & AI", "Culture",
      "Whales ($100K+)", "Top 1% Traders", "Long Shots", "Heavy Favorites", "Early Positions", "Late Positions", "Momentum", "New Accounts", "CEO Purchases", "Insider Clusters",
      "New Fund Positions (13F)", "Top Traders", "Soccer"]) expect(TRACKERS.map(t => t.name), name).toContain(name);
    expect(new Set(TRACKERS.map(t => t.slug)).size).toBe(TRACKERS.length);
    for (const t of TRACKERS) { expect(GROUPS).toContain(t.group); expect(t.photo).toBeGreaterThanOrEqual(2); }
    expect(FEATURED.every(isTrackerSlug)).toBe(true);
    expect(trackerBySlug("nope")).toBeNull();
  });

  it("Crypto Prices waits for the Crypto tab", () => {
    expect(visibleTrackers(() => false).some(t => t.slug === "crypto-prices")).toBe(false);
    expect(visibleTrackers(f => f === "crypto").some(t => t.slug === "crypto-prices")).toBe(true);
  });
});

describe("fixed rules", () => {
  it("Whales: $100K and up, bets only", () => {
    expect(fixedTags(mv({ amount: 100_000 }))).toContain("biggest-bets");
    expect(fixedTags(mv({ amount: 99_999 }))).not.toContain("biggest-bets");
    expect(fixedTags({ ...fund(), amount: 1e8 })).not.toContain("biggest-bets");
  });

  it("leagues: by the league, or by the competition and clubs the titles name", () => {
    expect(fixedTags(mv({ league: "NBA" }))).toContain("nba-big-money");
    expect(fixedTags(mv({ league: "NFL" }))).toContain("nfl-big-money");
    for (const [l, slug] of [["MLB", "mlb-big-money"], ["NHL", "nhl-big-money"], ["UFC", "ufc"], ["tennis", "tennis"], ["golf", "golf"]] as const) expect(fixedTags(mv({ league: l })), l).toContain(slug);
    expect(fixedTags(game("NCAAF: Ohio State vs. Michigan", { league: "college" }))).toContain("college-football");
    expect(fixedTags(game("March Madness: Duke vs. UNC", { league: "college" }))).toContain("college-basketball");
    expect(fixedTags(game("Arsenal vs. Chelsea", { league: "soccer" }))).toEqual(expect.arrayContaining(["premier-league", "soccer-big-money"]));
    expect(fixedTags(game("UEFA Champions League: Real Madrid vs. Bayern", { league: "soccer" }))).toContain("champions-league");
    expect(fixedTags(game("Real Madrid vs. Sevilla", { league: "soccer" }))).toContain("la-liga");
    expect(fixedTags(game("Juventus vs. Napoli", { league: "soccer" }))).toContain("serie-a");
    expect(fixedTags(game("Dota 2: Team Liquid vs. PARIVISION", { league: "other" }))).toContain("esports");
    expect(fixedTags(game("Counter-Strike: Vitality vs. NAVI", { league: "other" }))).toContain("esports");
    // Markets never land in a league tracker.
    expect(fixedTags(topic("NBA MVP?", "sports")).filter(s => s.includes("nba"))).toEqual([]);
  });

  it("topics: Fed & Rates by words; elections need 2026 or midterm; categories for the rest", () => {
    for (const t of ["Fed decision in December?", "Will the FOMC cut?", "Interest rate above 4%?", "Powell out as chair?"]) expect(fixedTags(topic(t, "economics")), t).toContain("fed-and-rates");
    for (const t of ["Fedor wins the match?", "Federal shutdown by Friday?"]) expect(fixedTags(topic(t, "economics")), t).not.toContain("fed-and-rates");
    expect(fixedTags(topic("Texas Senate race 2026 winner?", "politics"))).toContain("elections-2026");
    expect(fixedTags(topic("Which party wins the House in the midterms?", "politics"))).toContain("elections-2026");
    expect(fixedTags(topic("Presidential election 2028 winner?", "politics"))).not.toContain("elections-2026");
    expect(fixedTags(topic("Ceasefire by March?", "geopolitics"))).toContain("geopolitics");
    expect(fixedTags(topic("Best AI model end of year?", "tech"))).toContain("tech-and-ai");
    expect(fixedTags(topic("Album of the year?", "culture"))).toContain("culture");
    expect(fixedTags(mv({ tab: "crypto", league: null, category: "crypto" }))).toContain("crypto-prices");
  });

  it("styles: underdogs under 40¢, favorites over 75¢, new wallets at $25K+", () => {
    expect(fixedTags(mv({ avgPrice: 0.39 }))).toContain("underdog-hunters");
    expect(fixedTags(mv({ avgPrice: 0.4 }))).not.toContain("underdog-hunters");
    expect(fixedTags(mv({ avgPrice: 0.76 }))).toContain("favorites-only");
    expect(fixedTags(mv({ avgPrice: 0.75 }))).not.toContain("favorites-only");
    expect(fixedTags(mv({ newWallet: true, amount: 25_000 }))).toContain("new-wallets");
    expect(fixedTags(mv({ newWallet: true, amount: 24_999 }))).not.toContain("new-wallets");
    expect(fixedTags(mv({ newWallet: null, amount: 1e6 }))).not.toContain("new-wallets");
  });

  it("stocks: CEO buys by role, funds' new positions only", () => {
    expect(fixedTags(insider("CEO"))).toEqual(["ceo-buys"]);
    expect(fixedTags(insider("Chief Executive Officer, Director"))).toEqual(["ceo-buys"]);
    expect(fixedTags(insider("CFO"))).toEqual([]);
    expect(fixedTags(fund(true))).toEqual(["big-funds"]);
    expect(fixedTags(fund(false))).toEqual([]);
  });

  it("re-tagging keeps observed tags and drops stale fixed ones", () => {
    expect(retag(mv({ amount: 10_000, avgPrice: 0.5, trackers: ["biggest-bets", "steam", "late-money"] }))).toEqual(["late-money", "nba-big-money", "steam"]);
  });
});

describe("observed and live rules", () => {
  const info = (over: Partial<{ yesPrice: number | null; startAt: number | null; closed: boolean }> = {}) => ({ yesPrice: null, startAt: null, closed: false, ...over });
  it("Steam: 5¢+ their way on an open bet (NO bets gain when YES falls); never on a closed market", () => {
    expect(observedTags(mv({ avgPrice: 0.4 }), info({ yesPrice: 0.45 }))).toEqual(["steam"]);
    expect(observedTags(mv({ avgPrice: 0.4 }), info({ yesPrice: 0.449 }))).toEqual([]);
    expect(observedTags(mv({ avgPrice: 0.3, outcomeSide: "no" }), info({ yesPrice: 0.6 }))).toEqual(["steam"]);
    expect(observedTags(mv({ avgPrice: 0.4 }), info({ yesPrice: 0.6, closed: true }))).toEqual([]);
    expect(observedTags(mv({ avgPrice: 0.4, result: "won" }), info({ yesPrice: 0.6 }))).toEqual([]);
  });

  it("Early money 24h+ before the start, Late money in its last hour", () => {
    const start = NOW;
    expect(observedTags(mv({ at: start - 24 * H }), info({ startAt: start }))).toEqual(["early-money"]);
    expect(observedTags(mv({ at: start - 23 * H }), info({ startAt: start }))).toEqual([]);
    expect(observedTags(mv({ at: start - 30 * 60_000 }), info({ startAt: start }))).toEqual(["late-money"]);
    expect(observedTags(mv({ at: start + 60_000 }), info({ startAt: start }))).toEqual([]);
    expect(observedTags({ ...insider("CEO") }, info({ startAt: start, yesPrice: 1 }))).toEqual([]);
  });

  it("Cluster buys: three different insiders at one company within 30 days", () => {
    const l = [insider("CEO", { issuerCik: "9", owner: "A", at: NOW }), insider("CFO", { issuerCik: "9", owner: "B", at: NOW - 10 * DAY }), insider("Director", { issuerCik: "9", owner: "C", at: NOW - 29 * DAY }),
      insider("CEO", { issuerCik: "8", owner: "A", at: NOW }), insider("CEO", { issuerCik: "8", owner: "A", at: NOW - DAY }), insider("CFO", { issuerCik: "8", owner: "B", at: NOW })];
    const c = clusterIssuers(l);
    expect(c("9", NOW)).toBe(true);
    expect(c("9", NOW + 20 * DAY)).toBe(false);
    expect(c("8", NOW)).toBe(false);
  });

  it("kinds: fixed rules are stored, observed ones come from the venue, live ones are SQL", () => {
    expect(TRACKERS.filter(isLive).map(t => t.slug).sort()).toEqual(["cluster-buys", "top-1-percent", "top-traders"]);
    expect(TRACKERS.filter(isObserved).map(t => t.slug).sort()).toEqual(["early-money", "late-money", "steam"]);
    expect(TRACKERS.filter(isFixed).length + 6).toBe(TRACKERS.length);
  });
});

describe("tracker records", () => {
  const rec = (won: number, lost: number): TrackerRecord => ({ won, lost, oddsPct: 50, net: 0 });
  it("under 20 settled: New, never a record", () => {
    expect(TRACKER_MIN_SETTLED).toBe(20);
    expect(recordPill(rec(19, 0))).toEqual({ text: "New", tone: "new" });
    expect(recordPill(null)).toEqual({ text: "New", tone: "new" });
    expect(hasTrackerRecord(rec(12, 8))).toBe(true);
    expect(recordPill(rec(63, 37))).toEqual({ text: "Won 63%", tone: "won" });
    expect(recordPill(rec(9, 11))).toEqual({ text: "Won 45%", tone: "lost" });
    expect(winPct(rec(2, 1))).toBe(67);
  });

  it("Top performers: only trackers with a record, best win rate first, then most settled", () => {
    const rows = [{ slug: "a", record: rec(30, 10) }, { slug: "b", record: rec(10, 5) }, { slug: "c", record: rec(5, 1) }, { slug: "d", record: rec(60, 20) }, { slug: "e", record: null }];
    // b and c have under 20 settled; d and a tie on 75%, d has more settled.
    expect(topPerformers(rows).map(r => r.slug)).toEqual(["d", "a"]);
  });

  it("Top performers rank by return (net on the money in), not win rate", () => {
    const r = (won: number, lost: number, net: number, staked: number): TrackerRecord => ({ won, lost, oddsPct: 50, net, staked });
    const rows = [{ slug: "wins-often", record: r(80, 20, 1_000, 100_000) }, { slug: "pays-best", record: r(11, 14, 30_000, 100_000) }, { slug: "loses", record: r(15, 15, -5_000, 50_000) }, { slug: "new", record: r(5, 5, 9e9, 1) }];
    expect(topPerformers(rows).map(x => x.slug)).toEqual(["pays-best", "wins-often", "loses"]);
  });

  it("Popular: followers first, then money tracked", () => {
    expect(popular([{ s: "a", followers: 0, tracked30d: 9e6 }, { s: "b", followers: 2, tracked30d: 1 }, { s: "c", followers: 0, tracked30d: 1e7 }]).map(r => r.s)).toEqual(["b", "c", "a"]);
  });
});

describe("following a tracker", () => {
  it("a known slug only", () => {
    expect(parseFollow("tracker", "nba-big-money")).toEqual({ kind: "tracker", target: "nba-big-money" });
    expect(parseFollow("tracker", "NBA")).toBeNull();
  });

  it("alerts: a move in a followed tracker pings (fixed rules before the worker tags it; live rules from records)", () => {
    const u: AlertUser = { id: "u", plan: "insidir", email: null, push: true, emailOn: false, quietStart: null, quietEnd: null, timeZone: null,
      traders: new Set(), markets: new Set(), trackers: new Set(["top-traders", "underdog-hunters"]), rules: [] };
    expect(reasonFor(u, mv({ wallet: TOP }), ctx)).toBe("tracker");
    expect(reasonFor(u, mv({ avgPrice: 0.2 }), ctx)).toBe("tracker");
    expect(reasonFor(u, mv({ wallet: OTHER }), ctx)).toBeNull();
    expect(reasonFor({ ...u, plan: "free" }, mv({ wallet: TOP }), ctx)).toBeNull();
    expect(trackersOf(mv({ trackers: ["steam"] }), ctx)).toContain("steam");
    expect(alertJobs([u], [mv({ wallet: TOP })], NOW, ctx)).toHaveLength(1);
    expect(alertMessage(mv(), null, "tracker", "https://insidir.com", NOW).title).toBe("New position in a tracker you follow");
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_trackers_${process.pid}`;
describe.skipIf(!URL0)("trackers in Postgres", () => {
  let admin: pg.Client, pool: pg.Pool, db: Db;
  const prev = process.env.FEATURES_READY;
  beforeAll(async () => {
    process.env.FEATURES_READY = "feed,records,follows,stocks";
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  afterAll(async () => { process.env.FEATURES_READY = prev; await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("stored, observed and SQL rules pick the moves the pure rules do, and the record matches", async () => {
    const { upsertMoves, saveRecord } = await import("@/lib/moves/store");
    const { trackerMoves, trackerStatsOne } = await import("@/lib/trackers-store");
    const { tagOnce } = await import("@/lib/trackers-tag");
    const { tagObserved } = await import("@/lib/markets/info");
    const all: Move[] = [];
    const titles = ["Arsenal vs. Chelsea", "Lakers vs. Celtics", "Fed rate cut in December?", "Senate 2026 race winner?", "Dota 2: Liquid vs. Spirit"];
    for (let i = 0; i < 150; i++) {
      const settled = i % 3 !== 0, k = i % 5;
      all.push(mv({
        id: `pm:db:${i}`, marketId: `mk${i % 30}`, amount: 15_000 + (i * 9_973) % 200_000, avgPrice: 0.2 + (i % 7) / 10, wallet: i % 4 === 0 ? TOP : OTHER, newWallet: i % 9 === 0,
        league: k === 0 ? "soccer" : k === 1 ? "NBA" : k === 4 ? "other" : null, tab: k === 2 || k === 3 ? "markets" : "sports",
        category: k === 2 ? "economics" : k === 3 ? "politics" : "sports", eventTitle: titles[k]!, marketTitle: titles[k]!,
        result: settled ? (i % 2 ? "won" : "lost") : null, settledAt: settled ? NOW - (i % 40) * DAY : null,
        pnl: settled ? (i % 2 ? 1000 : -2000) : null, soldShare: i % 17 === 0 ? 0.9 : 0, at: NOW - i * H, lastAt: NOW - i * H, parts: null,
      }));
    }
    const sec = [insider("CEO", { issuerCik: "9", owner: "A" }), insider("CFO", { issuerCik: "9", owner: "B" }), insider("Director", { issuerCik: "9", owner: "C" }), insider("CEO", { issuerCik: "7", owner: "D" }), fund(true), fund(false)];
    all.push(...sec);
    await upsertMoves(db, all);
    for (const m of all) if (m.result) await pool.query("update terminal.moves set result = $2, settled_at = $3, pnl = $4, sold_share = $5 where id = $1", [m.id, m.result, new Date(m.settledAt!), m.pnl, m.soldShare]);
    await saveRecord(db, { wallet: TOP, name: null, resolved: 40, won: 25, lost: 15, profit: 9000, biggestWin: 100, updatedAt: NOW });
    await saveRecord(db, { wallet: OTHER, name: null, resolved: 40, won: 10, lost: 30, profit: -9000, biggestWin: 100, updatedAt: NOW });
    while (await tagOnce(db, 40)) { /* every move, a batch at a time */ }
    // What the venue says: mk1 has a start time; mk3 (open bets) has its YES price up.
    const infos = [{ source: "polymarket" as const, marketId: "mk1", yesPrice: null, startAt: NOW - 30.5 * H, closed: false, historyKey: null, updatedAt: NOW },
      { source: "polymarket" as const, marketId: "mk3", yesPrice: 0.95, startAt: null, closed: false, historyKey: null, updatedAt: NOW }];
    await tagObserved(db, "polymarket", infos, NOW);
    const byM = new Map(infos.map(i => [i.marketId, i]));
    const pureCtx: TrackerCtx = { topTrader: w => w === TOP, topPct: w => w === TOP, cluster: clusterIssuers(all) };
    const member = (m: Move) => {
      const tags = new Set([...fixedTags(m), ...(byM.get(m.marketId) && m.source === "polymarket" ? observedTags(m, byM.get(m.marketId)!) : [])]);
      return TRACKERS.filter(t => tags.has(t.slug) || (isLive(t) && t.rule.live(m, pureCtx))).map(t => t.slug);
    };
    const tabs = ["sports", "markets", "stocks"];
    for (const t of TRACKERS.filter(t => !t.needs)) {
      const want = all.filter(m => member(m).includes(t.slug));
      const got = await trackerMoves(db, t, { limit: 200 });
      expect(got.map(m => m.id).sort(), t.slug).toEqual(want.map(m => m.id).sort());
      const s = await trackerStatsOne(db, t, NOW);
      const counted = want.filter(m => countsToRecord(m, tabs));
      const pure = recordOf(counted);
      expect([s.records.all.won, s.records.all.lost], t.slug).toEqual([pure.won, pure.lost]);
      expect(s.records.all.net, t.slug).toBeCloseTo(counted.reduce((a, m) => a + (m.pnl ?? 0), 0));
      if (pure.oddsPct !== null) expect(s.records.all.oddsPct!, t.slug).toBeCloseTo(pure.oddsPct);
      expect(s.records["1w"].won + s.records["1w"].lost, t.slug).toBe(counted.filter(m => m.settledAt! >= NOW - 7 * DAY).length);
      expect(s.moves, t.slug).toBe(want.length);
    }
    // Sanity: the fixture reaches every kind of rule.
    for (const slug of ["premier-league", "esports", "fed-and-rates", "elections-2026", "steam", "late-money", "early-money", "cluster-buys", "top-1-percent", "big-funds", "ceo-buys"]) {
      expect((await trackerMoves(db, trackerBySlug(slug)!, { limit: 200 })).length, slug).toBeGreaterThan(0);
    }
  }, 120_000);

  it("the market-info job stores the price and start, keeps known values when the venue leaves them out, and tags Steam", async () => {
    const { upsertMoves } = await import("@/lib/moves/store");
    const { marketInfoOnce, infoFor } = await import("@/lib/markets/info");
    const now = Date.now();
    await upsertMoves(db, [mv({ id: "pm:info:1", marketId: "0xinfo1", avgPrice: 0.3, at: now - H, lastAt: now - H, parts: null })]);
    const market = (yesPrice: number | null, startTime: number | null) => ({ id: "0xinfo1", active: true, result: null, yesPrice, startTime, yesTokenId: "tok1" });
    let next = market(0.4, now + 5 * H);
    const clients = { polymarket: { getMarketsById: async () => new Map([["0xinfo1", next]]) }, kalshi: { getMarketsById: async () => new Map() } } as never;
    expect(await marketInfoOnce(db, clients, now)).toMatchObject({ read: 1, tagged: 1 });
    next = market(null, null);
    await marketInfoOnce(db, clients, now + 60_000);
    const i = (await infoFor(db, "polymarket", ["0xinfo1"])).get("0xinfo1")!;
    expect(i).toMatchObject({ yesPrice: 0.4, startAt: now + 5 * H, historyKey: "tok1", closed: false });
    const tags = (await pool.query("select trackers from terminal.moves where id = 'pm:info:1'")).rows[0].trackers;
    expect(tags).toContain("steam");
  });
});
