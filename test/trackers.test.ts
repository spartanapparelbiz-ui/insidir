/* Trackers (lib/trackers.ts): each rule, the record and its "New" floor, the rankings, follows, alerts, and (with an
 * e2e database) that every tracker's SQL rule picks exactly the moves its pure rule does and the record matches. */
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
  FEATURED, hasTrackerRecord, isTrackerSlug, popular, recordPill, topPerformers, TRACKER_MIN_SETTLED, trackerBySlug, TRACKERS, trackersOf, winPct,
  type TrackerRecord,
} from "@/lib/trackers";
import { recordOf, countsToRecord } from "@/lib/trust";

const NOW = Date.UTC(2026, 9, 29, 12);
const H = 3_600_000;
const TOP = "0x" + "a".repeat(40), OTHER = "0x" + "b".repeat(40);
const ctx = { topTrader: (w: string) => w === TOP };

let n = 0;
function mv(over: Partial<Move> = {}): Move {
  n++;
  return {
    id: `pm:test:${n}`, source: "polymarket", marketId: `m${n}`, eventTitle: "Lakers vs. Celtics", marketTitle: "Lakers vs. Celtics", outcome: "Lakers",
    outcomeSide: "yes", amount: 20_000, avgPrice: 0.5, wallet: OTHER, walletName: null, at: NOW - H, lastAt: NOW - H, fills: 1, tab: "sports", league: "NBA",
    category: "sports", url: null, result: null, settledAt: null, newWallet: false, pnl: null, soldShare: 0, ...over,
  };
}
const insider = (role: string): Move => mv({ source: "sec", tab: "stocks", league: null, category: "insider", wallet: null, amount: 500_000,
  detail: { kind: "insider", company: "Example Corp", ticker: "EXC", issuerCik: "1", role, ownerName: "Pat Lee", ownerCik: "2", shares: 1000, pricePerShare: 500, tradeDate: "2026-10-20", filedAt: NOW, accession: `a${n}` } });
const fund = (): Move => mv({ source: "sec", tab: "stocks", league: null, category: "fund", wallet: null, amount: 9_000_000,
  detail: { kind: "fund", company: "Example Corp", cusip: "123", fund: "Big Fund", fundCik: "3", period: "2026-09-30", filedOn: "2026-10-28", addedShares: 10, prevShares: 0, curShares: 10, curValue: 9_000_000, newPosition: true, accession: "x", prevAccession: "y" } });

describe("tracker rules", () => {
  it("ten trackers, unique slugs, distinct covers, four featured", () => {
    expect(TRACKERS.map(t => t.name)).toEqual(["Biggest Bets", "Top Traders", "NBA Big Money", "NFL Big Money", "Soccer Big Money", "Fed & Rates", "Elections 2026", "CEO Buys", "Big Funds (13F)", "Brand-New Wallets"]);
    expect(new Set(TRACKERS.map(t => t.slug)).size).toBe(10);
    expect(new Set(TRACKERS.map(t => t.photo)).size).toBe(10);
    expect(FEATURED.every(isTrackerSlug)).toBe(true);
    expect(trackerBySlug("nope")).toBeNull();
  });

  it("Biggest Bets: $100K and up, bets only", () => {
    expect(trackersOf(mv({ amount: 100_000 }), ctx)).toContain("biggest-bets");
    expect(trackersOf(mv({ amount: 99_999 }), ctx)).not.toContain("biggest-bets");
    expect(trackersOf(fund(), ctx)).not.toContain("biggest-bets");
  });

  it("Top Traders: the wallet's record decides", () => {
    expect(trackersOf(mv({ wallet: TOP }), ctx)).toContain("top-traders");
    expect(trackersOf(mv({ wallet: OTHER }), ctx)).not.toContain("top-traders");
    expect(trackersOf(mv({ source: "kalshi", wallet: null }), ctx)).not.toContain("top-traders");
  });

  it("leagues: NBA, NFL, soccer", () => {
    expect(trackersOf(mv({ league: "NBA" }), ctx)).toContain("nba-big-money");
    expect(trackersOf(mv({ league: "NFL" }), ctx)).toEqual(["nfl-big-money"]);
    expect(trackersOf(mv({ league: "soccer" }), ctx)).toEqual(["soccer-big-money"]);
    expect(trackersOf(mv({ league: "MLB" }), ctx)).toEqual([]);
  });

  it("Fed & Rates: Fed, FOMC, rate words; not 'federal' alone or 'Fedor'", () => {
    const m = (t: string) => mv({ tab: "markets", league: null, category: "economics", eventTitle: t, marketTitle: t });
    for (const t of ["Fed decision in December?", "Will the FOMC cut?", "Interest rate above 4%?", "Powell out as chair?", "Fed rate cut by 25 bps?"]) expect(trackersOf(m(t), ctx), t).toContain("fed-and-rates");
    for (const t of ["Fedor wins the match?", "Federal shutdown by Friday?"]) expect(trackersOf(m(t), ctx), t).not.toContain("fed-and-rates");
  });

  it("Elections 2026: politics, an election word and 2026 or midterm", () => {
    const m = (t: string, category = "politics") => mv({ tab: "markets", league: null, category, eventTitle: t, marketTitle: t });
    expect(trackersOf(m("Texas Senate race 2026 winner?"), ctx)).toContain("elections-2026");
    expect(trackersOf(m("Which party wins the House in the midterms?"), ctx)).toContain("elections-2026");
    expect(trackersOf(m("Presidential election 2028 winner?"), ctx)).not.toContain("elections-2026");
    expect(trackersOf(m("Senate 2026 winner?", "sports"), ctx)).not.toContain("elections-2026");
  });

  it("CEO Buys and Big Funds: SEC filings", () => {
    expect(trackersOf(insider("CEO"), ctx)).toEqual(["ceo-buys"]);
    expect(trackersOf(insider("Chief Executive Officer, Director"), ctx)).toEqual(["ceo-buys"]);
    expect(trackersOf(insider("CFO"), ctx)).toEqual([]);
    expect(trackersOf(fund(), ctx)).toEqual(["big-funds"]);
  });

  it("Brand-New Wallets: only wallets with no history (null is unknown, not new)", () => {
    expect(trackersOf(mv({ newWallet: true }), ctx)).toContain("new-wallets");
    expect(trackersOf(mv({ newWallet: null }), ctx)).not.toContain("new-wallets");
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

  it("Popular: followers first, then money tracked", () => {
    expect(popular([{ s: "a", followers: 0, tracked30d: 9e6 }, { s: "b", followers: 2, tracked30d: 1 }, { s: "c", followers: 0, tracked30d: 1e7 }]).map(r => r.s)).toEqual(["b", "c", "a"]);
  });
});

describe("following a tracker", () => {
  it("a known slug only", () => {
    expect(parseFollow("tracker", "nba-big-money")).toEqual({ kind: "tracker", target: "nba-big-money" });
    expect(parseFollow("tracker", "NBA")).toBeNull();
  });

  it("alerts: a move in a followed tracker pings, with its own title", () => {
    const u: AlertUser = { id: "u", plan: "insidir", email: null, push: true, emailOn: false, quietStart: null, quietEnd: null, timeZone: null,
      traders: new Set(), markets: new Set(), trackers: new Set(["top-traders"]), rules: [] };
    expect(reasonFor(u, mv({ wallet: TOP }), ctx)).toBe("tracker");
    expect(reasonFor(u, mv({ wallet: OTHER }), ctx)).toBeNull();
    expect(reasonFor({ ...u, plan: "free" }, mv({ wallet: TOP }), ctx)).toBeNull();
    expect(alertJobs([u], [mv({ wallet: TOP })], NOW, ctx)).toHaveLength(1);
    expect(alertMessage(mv(), null, "tracker", "https://insidir.com", NOW).title).toBe("New move in a tracker you follow");
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

  it("every tracker's SQL rule picks the moves its pure rule does, and the record matches", async () => {
    const { upsertMoves, saveRecord } = await import("@/lib/moves/store");
    const { trackerMoves, trackerStatsOne } = await import("@/lib/trackers-store");
    const all: Move[] = [];
    const leagues = ["NBA", "NFL", "soccer", "MLB"] as const;
    for (let i = 0; i < 120; i++) {
      const settled = i % 3 !== 0;
      all.push(mv({
        id: `pm:db:${i}`, amount: 15_000 + (i * 9_973) % 200_000, avgPrice: 0.2 + (i % 7) / 10, wallet: i % 4 === 0 ? TOP : OTHER, newWallet: i % 9 === 0,
        league: i % 5 === 4 ? null : leagues[i % 4], tab: i % 5 === 4 ? "markets" : "sports", category: i % 5 === 4 ? (i % 2 ? "economics" : "politics") : "sports",
        eventTitle: i % 5 === 4 ? (i % 2 ? "Fed rate cut in December?" : "Senate 2026 race winner?") : "Game", marketTitle: i % 5 === 4 ? (i % 2 ? "Fed rate cut in December?" : "Senate 2026 race winner?") : "Game",
        result: settled ? (i % 2 ? "won" : "lost") : null, settledAt: settled ? NOW - (i % 40) * 86_400_000 : null,
        pnl: settled ? (i % 2 ? 1000 : -2000) : null, soldShare: i % 17 === 0 ? 0.9 : 0, at: NOW - i * H, lastAt: NOW - i * H,
      }));
    }
    all.push(insider("CEO"), insider("CFO"), fund());
    for (const m of all) m.parts = null;
    await upsertMoves(db, all);
    // upsertMoves leaves the settlement columns alone: set them as the settle job would.
    for (const m of all) if (m.result) await pool.query("update terminal.moves set result = $2, settled_at = $3, pnl = $4, sold_share = $5 where id = $1", [m.id, m.result, new Date(m.settledAt!), m.pnl, m.soldShare]);
    await saveRecord(db, { wallet: TOP, name: null, resolved: 40, won: 25, lost: 15, profit: 9000, biggestWin: 100, updatedAt: NOW });
    await saveRecord(db, { wallet: OTHER, name: null, resolved: 40, won: 10, lost: 30, profit: -9000, biggestWin: 100, updatedAt: NOW });

    for (const t of TRACKERS) {
      const want = all.filter(m => t.match(m, ctx));
      const got = await trackerMoves(db, t, { limit: 200 });
      expect(got.map(m => m.id).sort(), t.slug).toEqual(want.map(m => m.id).sort());
      const s = await trackerStatsOne(db, t, NOW);
      const pure = recordOf(want.filter(m => countsToRecord(m, ["sports", "markets", "stocks"])));
      expect(s.records.all.won, t.slug).toBe(pure.won);
      expect(s.records.all.lost, t.slug).toBe(pure.lost);
      expect(s.records.all.net, t.slug).toBeCloseTo(want.filter(m => countsToRecord(m, ["sports", "markets", "stocks"])).reduce((a, m) => a + (m.pnl ?? 0), 0));
      if (pure.oddsPct !== null) expect(s.records.all.oddsPct!, t.slug).toBeCloseTo(pure.oddsPct);
      const week = want.filter(m => countsToRecord(m, ["sports", "markets", "stocks"]) && m.settledAt! >= NOW - 7 * 86_400_000);
      expect(s.records["1w"].won + s.records["1w"].lost, t.slug).toBe(week.length);
      expect(s.moves, t.slug).toBe(want.length);
      expect(s.tracked30d, t.slug).toBeCloseTo(want.filter(m => m.at >= NOW - 30 * 86_400_000).reduce((a, m) => a + m.amount, 0));
    }
  }, 60_000);
});
