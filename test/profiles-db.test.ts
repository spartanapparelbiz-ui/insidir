/* Profiles against a real Postgres (a throwaway database next to E2E_DATABASE_URL, migrated from drizzle/): the facts
 * behind "why this matters", the /top ranking, the records job keeping every resolved position, and the SEC history
 * and fund jobs reading filings into rows. Skipped when E2E_DATABASE_URL isn't set. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { PolymarketClient } from "@/lib/exchanges";
import { recordsOnce } from "@/lib/moves/jobs";
import { saveRecord, upsertMoves } from "@/lib/moves/store";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";
import type { Move, TraderRecord } from "@/lib/moves/types";
import { followedTrades, fundQuarters, issuerForTicker, issuersByCik, issuerTradesFor, latestCloses, marketsFor, ownersByCik, sitemapSec, stockSuggestions, topRanking } from "@/lib/profiles/store";
import { followingFeed } from "@/lib/following-feed";
import { follow, followList, listMoves } from "@/lib/moves/store";
import { traderStats } from "@/lib/profiles/trader";
import { whyLines } from "@/lib/profiles/why-facts";
import { fundHistoryOnce, historyOnce, queueHistory, saveTrades } from "@/lib/stocks/history";
import type { SecClient } from "@/lib/stocks/sec";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_unit_${process.pid}`;
const DAY = 86_400_000, H = 3_600_000;
const NOW = Date.UTC(2026, 9, 26, 18, 0, 0);
const wallet = (n: number) => `0x${String(n).padStart(40, "0")}`;
let admin: pg.Client, pool: pg.Pool, db: Db;

describe.skipIf(!URL0)("profiles in Postgres", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists ${NAME}`);
    await admin?.end();
  });
  beforeEach(async () => {
    await db.execute(`truncate terminal.moves, terminal.trader_records, terminal.trader_positions, terminal.tracked_wallets, terminal.insider_trades,
      terminal.sec_history, terminal.funds, terminal.fund_filings, terminal.fund_holdings, terminal.stock_closes, terminal.follows, terminal.users cascade`);
  });

  const move = (o: Partial<Move>): Move => ({
    id: `pm:${Math.random()}`, source: "polymarket", marketId: "C1", eventTitle: "Chiefs vs Bills", marketTitle: "Chiefs vs Bills", outcome: "Chiefs", outcomeSide: "yes",
    amount: 50_000, avgPrice: 0.62, wallet: wallet(1), walletName: null, at: NOW - 30 * 60_000, lastAt: NOW - 30 * 60_000, fills: 1, tab: "sports", league: "NFL",
    category: "sports", url: null, result: null, settledAt: null, ...o,
  });
  const record = (w: string, o: Partial<TraderRecord> = {}): TraderRecord =>
    ({ wallet: w, name: null, resolved: 40, won: 30, lost: 10, profit: 500_000, biggestWin: 90_000, biggestBet: 100_000, updatedAt: NOW - DAY, ...o });

  it("why: biggest bet on this game today, from the day's other moves up to the viewer's clock", async () => {
    const m = move({ id: "pm:big", amount: 300_000, wallet: wallet(9) });
    await upsertMoves(db, [m, move({ id: "pm:a", amount: 120_000, wallet: wallet(2), at: NOW - 2 * H }), move({ id: "pm:b", amount: 90_000, wallet: wallet(3), outcomeSide: "no", outcome: "Bills" })]);
    expect((await whyLines(db, [m], { records: false, until: NOW, now: NOW })).get("pm:big")).toBe("Biggest bet on this game today.");
    // A bigger move later today, visible on the viewer's clock, takes it away.
    await upsertMoves(db, [move({ id: "pm:later", amount: 400_000, wallet: wallet(4), at: NOW - 5 * 60_000 })]);
    expect((await whyLines(db, [m], { records: false, until: NOW, now: NOW })).get("pm:big")).toBeNull();
    // A free viewer's clock is 30 minutes behind: the later move isn't theirs to see yet.
    expect((await whyLines(db, [m], { records: false, until: NOW - 25 * 60_000, now: NOW })).get("pm:big")).toBe("Biggest bet on this game today.");
  });

  it("why: biggest bet this trader ever made, and top traders on the same side (members only)", async () => {
    const m = move({ id: "pm:t", amount: 150_000, wallet: wallet(1) });
    await upsertMoves(db, [m]);
    await saveRecord(db, record(wallet(1), { biggestBet: 100_000 }));
    expect((await whyLines(db, [m], { records: true, until: NOW, now: NOW })).get("pm:t")).toBe("Biggest bet this trader has ever made.");
    expect((await whyLines(db, [m], { records: false, until: NOW, now: NOW })).get("pm:t")).toBeNull();
    // An earlier move of theirs was bigger.
    await upsertMoves(db, [move({ id: "pm:old", amount: 160_000, wallet: wallet(1), marketId: "C9", at: NOW - 40 * DAY })]);
    expect((await whyLines(db, [m], { records: true, until: NOW, now: NOW })).get("pm:t")).toBeNull();
    // Two other top traders on the same side in the 24 hours before (one more on the other side doesn't count).
    // (Their moves are bigger, so this isn't the biggest bet on the game today.)
    await upsertMoves(db, [move({ id: "pm:x", wallet: wallet(2), amount: 200_000, at: NOW - 5 * H }), move({ id: "pm:y", wallet: wallet(3), at: NOW - 20 * H }),
      move({ id: "pm:z", wallet: wallet(4), outcomeSide: "no", outcome: "Bills", at: NOW - 3 * H })]);
    for (const w of [2, 3, 4]) await saveRecord(db, record(wallet(w)));
    expect((await whyLines(db, [m], { records: true, until: NOW, now: NOW })).get("pm:t")).toBe("3 top traders are on the same side.");
  });

  it("why: the insider rules read the stored filings and how far back each history is complete", async () => {
    const base = { ownerName: "HUANG JEN HSUN", role: "The CEO", company: "Nvidia", ticker: "NVDA", url: "https://www.sec.gov/x", line: 0, price: 100 };
    const t = (acc: string, owner: string, issuer: string, date: string, value: number) =>
      ({ ...base, accession: acc, ownerCik: owner, issuerCik: issuer, code: "P" as const, tradeDate: date, shares: value / 100, value, filedAt: new Date(`${date}T21:00:00Z`) });
    await saveTrades(db, [t("old1", "1197647", "1045810", "2021-06-01", 2_000_000), t("other", "55", "1045810", "2023-02-01", 500_000)]);
    await queueHistory(db, [{ kind: "owner", cik: "1197647", name: null }, { kind: "issuer", cik: "1045810", name: null }]);
    await db.execute(`update terminal.sec_history set complete_since = '2016-11-01', pending = '[]'::jsonb`);
    const m: Move = move({ id: "f4:new", source: "sec", tab: "stocks", wallet: null, amount: 1_400_000, detail: {
      kind: "insider", company: "Nvidia", ticker: "NVDA", issuerCik: "0001045810", role: "The CEO", ownerName: "HUANG JEN HSUN", ownerCik: "0001197647",
      shares: 10_000, pricePerShare: 140, tradeDate: "2026-10-20", filedAt: NOW - DAY, accession: "new" } });
    expect((await whyLines(db, [m], { records: false, until: NOW, now: NOW })).get("f4:new")).toBe("First buy by Jen Hsun Huang in 5 years.");
    // Without the owner's history complete, the next rule: the 2021 buy was bigger, so "since 2021".
    await db.execute(`update terminal.sec_history set complete_since = null where kind = 'owner'`);
    expect((await whyLines(db, [m], { records: false, until: NOW, now: NOW })).get("f4:new")).toBe("Biggest insider buy at Nvidia since 2021.");
    // Two insiders bought this month.
    await saveTrades(db, [t("m1", "1197647", "1045810", "2026-10-20", 1_400_000), t("m2", "77", "1045810", "2026-10-05", 300_000)]);
    expect((await whyLines(db, [m], { records: false, until: NOW, now: NOW })).get("f4:new")).toBe("2 Nvidia insiders bought this month.");
  });

  it("/top: 20+ resolved all-time, ranked by profit in the window and tab, with best category", async () => {
    const pos = (w: string, i: number, pnl: number, daysAgo: number, tab: "sports" | "markets", category: string) =>
      ({ wallet: w, marketId: `${w}:${i}`, outcomeIndex: 0, title: "t", outcome: "Yes", eventSlug: null, category, tab, moneyIn: 1000, pnl, resolvedAt: new Date(NOW - daysAgo * DAY) });
    const rows = [
      // A: 25 markets, big all-time (old), little this week
      ...Array.from({ length: 24 }, (_, i) => pos(wallet(1), i, 10_000, 100, "sports", "NBA")), pos(wallet(1), 99, 100, 2, "sports", "NBA"),
      // B: 22 markets, best this week, in Markets
      ...Array.from({ length: 20 }, (_, i) => pos(wallet(2), i, 1000, 100, "markets", "Markets")), pos(wallet(2), 98, 50_000, 3, "markets", "Markets"), pos(wallet(2), 99, -5_000, 4, "sports", "NFL"),
      // C: only 10 markets: never ranked
      ...Array.from({ length: 10 }, (_, i) => pos(wallet(3), i, 1_000_000, 1, "sports", "NFL")),
    ];
    await db.insert(schema.traderPositions).values(rows);
    await saveRecord(db, record(wallet(1), { resolved: 25, name: "alpha" }));
    await saveRecord(db, record(wallet(2), { resolved: 22 }));
    await saveRecord(db, record(wallet(3), { resolved: 10 }));
    const all = await topRanking(db, "all", null, NOW);
    expect(all.map(r => [r.wallet, r.name, r.resolved, r.best])).toEqual([[wallet(1), "alpha", 25, "NBA"], [wallet(2), null, 22, "Markets"]]);
    const week = await topRanking(db, "week", null, NOW);
    expect(week.map(r => [r.wallet, r.profit, r.won, r.resolved])).toEqual([[wallet(2), 45_000, 1, 2], [wallet(1), 100, 1, 1]]);
    expect((await topRanking(db, "week", "sports", NOW)).map(r => r.wallet)).toEqual([wallet(1)]); // B lost in sports this week
  });

  it("the records job keeps every resolved position and the biggest bet, and the stats come from them", async () => {
    const closed = Array.from({ length: 23 }, (_, i) => ({ conditionId: `C${i}`, outcomeIndex: 0, title: i < 12 ? "Lakers vs Celtics" : "Fed rate cut?", eventSlug: i < 12 ? "nba-lal-bos" : "fed",
      avgPrice: 0.5, totalBought: 2000, realizedPnl: i % 4 === 0 ? -1000 : 1000, timestamp: Math.floor((NOW - (30 - i) * DAY) / 1000) }));
    const poly = {
      getClosedPositionsPage: async (_w: string, o: { offset?: number }) => (o.offset ? [] : closed),
      getPositions: async () => [{ initialValue: 75_000 }],
    } as unknown as PolymarketClient;
    await upsertMoves(db, [move({ wallet: wallet(5), at: NOW - DAY })]);
    expect(await recordsOnce(db, poly, NOW)).toBe(1);
    const ms = await marketsFor(db, wallet(5));
    expect(ms).toHaveLength(23);
    const s = traderStats(ms, NOW);
    expect(s).toMatchObject({ resolved: 23, won: 17, lost: 6, profit: 11_000, moneyIn: 23_000 });
    expect(s.categories.map(c => c.category).sort()).toEqual(["Markets", "NBA"]);
    const rec = (await db.select().from(schema.traderRecords))[0]!;
    expect(rec).toMatchObject({ resolved: 23, won: 17, biggestBet: 75_000 });
  });

  it("the SEC history job reads an insider's Form 4s into trades and marks the history complete", async () => {
    const xml = readFileSync(join(__dirname, "fixtures/sec/form4-ceo-buy.xml"), "utf8");
    const subs = { name: "Doe Jane", filings: { recent: { form: ["4", "4", "10-K"], accessionNumber: ["0001214156-26-000002", "0001214156-26-000001", "0001214156-26-000000"], filingDate: ["2026-10-22", "2025-01-10", "2025-01-01"] } } };
    const index = { directory: { item: [{ name: "0001214156-26-000002-index.html", "last-modified": "2026-10-22 16:01:00" }, { name: "form4.xml" }] } };
    const asked: string[] = [];
    const sec = {
      json: async (url: string) => { asked.push(url); return url.includes("submissions") ? subs : index; },
      text: async (url: string) => { asked.push(url); return xml; },
    } as unknown as SecClient;
    await queueHistory(db, [{ kind: "owner", cik: "0001214156", name: null }]);
    const r1 = await historyOnce(db, sec, NOW, 1);
    expect(r1).toEqual({ read: 1, done: 0, errors: 0 });
    let h = (await db.select().from(schema.secHistory))[0]!;
    expect([h.completeSince, h.pending.length, h.name]).toEqual([null, 1, "Doe Jane"]);
    const r2 = await historyOnce(db, sec, NOW);
    expect(r2).toEqual({ read: 1, done: 1, errors: 0 });
    h = (await db.select().from(schema.secHistory))[0]!;
    expect([h.completeSince, h.pending.length]).toEqual(["2025-01-10", 0]);
    const trades = await db.select().from(schema.insiderTrades);
    expect(new Set(trades.map(t => t.code))).toEqual(new Set(["P"]));
    expect(new Set(trades.map(t => t.accession))).toEqual(new Set(["000121415626000002", "000121415626000001"]));
    expect(trades.every(t => t.url.includes(t.accession) && t.ownerCik === "1214156")).toBe(true);
    expect(asked.every(u => u.startsWith("https://data.sec.gov/") || u.startsWith("https://www.sec.gov/Archives/edgar/data/1214156/"))).toBe(true);
  });

  it("the fund job keeps one more complete quarter per run, never an incomplete one", async () => {
    const subs = { name: "BERKSHIRE HATHAWAY INC", filings: { recent: {
      form: ["13F-HR", "13F-HR", "13F-HR"], accessionNumber: ["0000950123-26-000003", "0000950123-26-000002", "0000950123-26-000001"],
      filingDate: ["2026-08-14", "2026-05-15", "2026-02-14"], reportDate: ["2026-06-30", "2026-03-31", "2025-12-31"], acceptanceDateTime: ["", "", ""] } } };
    const sec = { json: async () => subs } as unknown as SecClient;
    const read = async (_c: string, f: { accession: string }) => f.accession.endsWith("2")
      ? null : new Map([["037833100", { issuerName: "APPLE INC", cusip: "037833100", shares: 1000, value: 230_000 }]]);
    for (let i = 0; i < 4; i++) await fundHistoryOnce(db, sec, "1067983", NOW, read);
    const q = await fundQuarters(db, "1067983");
    expect(q.map(x => x.accession)).toEqual(["000095012326000003", "000095012326000001"]);
    expect(q[0]!.holdings).toEqual([{ cusip: "037833100", company: "APPLE", shares: 1000, value: 230_000 }]);
    expect((await db.select().from(schema.funds))[0]).toMatchObject({ name: "BERKSHIRE HATHAWAY", quartersOnFile: 3 });
  });

  describe("the public SEC pages and the Following feed", () => {
    const base = { role: "The CEO", company: "E2E Fixture Devices", ticker: "EXDV", issuerCik: "999999", url: "https://www.sec.gov/x", price: 100 };
    const t = (acc: string, owner: string, name: string, date: string, value: number, code: "P" | "S" = "P", line = 0) =>
      ({ ...base, accession: acc, line, ownerCik: owner, ownerName: name, code, tradeDate: date, shares: value / 100, value, filedAt: new Date(`${date}T21:00:00Z`) });
    const seed = async () => {
      await saveTrades(db, [t("a1", "888888", "FIXTURE JANE", "2026-10-22", 1_000_000), t("a1", "888888", "FIXTURE JANE", "2026-10-22", 401_811, "P", 1),
        t("a2", "777", "DOE JOHN", "2026-10-05", 300_000), t("a3", "777", "DOE JOHN", "2026-08-01", 450_000, "S"),
        { ...t("b1", "555", "ROE RICHARD", "2026-10-10", 90_000), issuerCik: "111", company: "Other Co", ticker: "OTH" }]);
    };

    it("a company by ticker, its trades newest first, owners and companies by CIK", async () => {
      await seed();
      expect(await issuerForTicker(db, "exdv")).toEqual({ issuerCik: "999999", company: "E2E Fixture Devices", ticker: "EXDV" });
      expect(await issuerForTicker(db, "NOPE")).toBeNull();
      expect((await issuerTradesFor(db, "0000999999")).map(r => r.accession)).toEqual(["a1", "a1", "a2", "a3"]);
      expect((await ownersByCik(db, ["777"])).get("777")).toEqual({ name: "DOE JOHN", role: "The CEO", company: "E2E Fixture Devices" });
      expect((await issuersByCik(db, ["111"])).get("111")).toEqual({ company: "Other Co", ticker: "OTH" });
    });

    it("the latest close per ticker, only when we hold one", async () => {
      expect((await latestCloses(db, ["EXDV"])).size).toBe(0);
      await db.execute(`insert into terminal.stock_closes (ticker, date, close) values ('EXDV', '2026-10-26', 110), ('EXDV', '2026-10-27', 120)`);
      expect((await latestCloses(db, ["exdv", "OTH"])).get("EXDV")).toEqual({ ticker: "EXDV", date: "2026-10-27", close: 120 });
    });

    it("the sitemap lists insiders and companies with a recent trade, and every fund", async () => {
      await seed();
      await db.insert(schema.funds).values({ cik: "999998", name: "E2E Fixture Capital", quartersOnFile: 48, updatedAt: new Date(NOW) });
      const s = await sitemapSec(db, new Date(NOW - 60 * DAY));
      expect(s.insiders.map(i => i.cik).sort()).toEqual(["555", "777", "888888"]);
      expect(s.companies.map(c => c.ticker).sort()).toEqual(["EXDV", "OTH"]);
      expect(s.funds.map(f => f.name)).toEqual(["E2E Fixture Capital"]);
      // John Doe last filed Oct 5: past a 20-day window.
      expect((await sitemapSec(db, new Date(NOW - 20 * DAY))).insiders.map(i => i.cik).sort()).toEqual(["555", "888888"]);
    });

    it("onboarding's suggestions: most buying in 30 days", async () => {
      await seed();
      const s = await stockSuggestions(db, new Date(NOW - 30 * DAY));
      expect(s.insiders[0]).toMatchObject({ cik: "888888", bought: 1_401_811 });
      expect(s.companies[0]).toMatchObject({ cik: "999999", insiders: 2 });
    });

    it("following an insider and a company: their filings in the member's feed, with moves of followed traders", async () => {
      await seed();
      await db.insert(schema.users).values({ id: "u1", email: "u1@example.com", plan: "insidir", settings: DEFAULT_SETTINGS });
      await follow(db, "u1", "insider", "777");
      await follow(db, "u1", "company", "111");
      await follow(db, "u1", "trader", wallet(5));
      expect((await followedTrades(db, ["777"], [], new Date(NOW - 30 * DAY))).map(r => r.accession)).toEqual(["a2"]);
      await upsertMoves(db, [move({ id: "pm:f", wallet: wallet(5), at: NOW - 2 * H }), move({ id: "pm:g", wallet: wallet(6), at: NOW - H })]);
      expect((await listMoves(db, { followed: { wallets: [], marketIds: [] } })).length).toBe(0);
      const feed = await followingFeed(db, await followList(db, "u1"), "insidir", "us", NOW);
      expect(feed.map(e => (e.type === "move" ? e.item.id : e.item.key))).toEqual(["pm:f", "f4:b1:555:P", "f4:a2:777:P"]);
    });
  });
});
