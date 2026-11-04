/* The Book (lib/book): settled P&L at the member's own price, the totals (exposure by category, win rate, net, average
 * entry), the CSV, the monthly statement's month, the daily push's time and words; then in Postgres: copies and placed
 * Autopilot matches in one Book, placed / skipped / corrected fill. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { bookFor, correctCopy, markMatch, settledPnl, summarize, type Entry } from "@/lib/book/book";
import { bookCsv, inMonth, monthRange, statementPdf } from "@/lib/book/export";
import { bookPushDue, bookPushText } from "@/lib/book/daily";

const NOW = Date.UTC(2026, 10, 4, 18);
const e = (o: Partial<Entry>): Entry => ({ key: "c1", kind: "copy", id: 1, title: "Heat vs. Lakers", outcome: "Heat", side: "yes", category: "basketball", venue: "kalshi",
  price: 0.5, contracts: 100, cost: 50, at: NOW - 86_400_000, result: null, settledAt: null, mark: 0.6, live: 10, pnl: null, url: "/copy/x", ...o });

describe("the Book, pure", () => {
  it("settles at the member's own price, losses in full", () => {
    expect(settledPnl("won", 40, 24.8)).toBe(15.2);
    expect(settledPnl("lost", 40, 24.8)).toBe(-24.8);
    expect(settledPnl("void", 40, 24.8)).toBe(0);
    expect(settledPnl(null, 40, 24.8)).toBeNull();
  });
  it("adds up exposure by category, live P&L, win rate, net and average entry", () => {
    const list = [e({}), e({ key: "c2", category: "hockey", cost: 20, live: -4 }), e({ key: "c3", result: "won", pnl: 50, settledAt: NOW - 3_600_000, mark: null, live: null }),
      e({ key: "c4", result: "lost", price: 0.7, cost: 70, pnl: -70, mark: null, live: null }), e({ key: "c5", result: "void", pnl: 0, mark: null, live: null })];
    const s = summarize(list);
    expect(s).toMatchObject({ open: 2, settled: 3, won: 1, lost: 1, void: 1, exposure: 70, live: 6, net: -20, staked: 120, winRate: 0.5 });
    expect(s.byCategory).toEqual([{ category: "basketball", exposure: 50, open: 1 }, { category: "hockey", exposure: 20, open: 1 }]);
    expect(s.avgEntry).toBeCloseTo((0.5 * 50 + 0.7 * 70) / 120);
  });
  it("exports CSV and picks a month's entries", () => {
    const csv = bookCsv([e({ title: 'Heat, "Lakers"' })]);
    expect(csv.split("\n")[0]).toBe("date,type,market,outcome,side,venue,category,contracts,fill_price,cost,result,settled,pnl,kalshi_now,live_pnl");
    expect(csv.split("\n")[1]).toBe('2026-11-03,copy,"Heat, ""Lakers""",Heat,yes,kalshi,basketball,100,0.50,50.00,open,,,0.60,10.00');
    expect(monthRange("2026-13")).toBeNull();
    const r = monthRange("2026-11")!;
    expect(inMonth([e({}), e({ key: "old", at: Date.UTC(2026, 9, 10) }), e({ key: "oldSettled", at: Date.UTC(2026, 9, 10), settledAt: Date.UTC(2026, 10, 2), result: "won" })], r).map(x => x.key)).toEqual(["c1", "oldSettled"]);
  });
  it("writes a statement PDF", async () => {
    const pdf = await statementPdf({ month: "2026-11", email: "a@example.test", entries: [e({}), e({ key: "c3", result: "won", pnl: 50, settledAt: NOW })], generatedAt: NOW });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
  it("pushes once a day at the member's time, in plain words", () => {
    // 18:00 UTC is 13:00 in New York.
    expect(bookPushDue(NOW, "13:00", "America/New_York")).toBe("2026-11-04");
    expect(bookPushDue(NOW, "12:59", "America/New_York")).toBe("2026-11-04");
    expect(bookPushDue(NOW, "13:01", "America/New_York")).toBeNull();
    expect(bookPushDue(NOW, "10:00", "America/New_York")).toBeNull();
    expect(bookPushDue(NOW, null, "America/New_York")).toBeNull();
    const t = bookPushText([e({}), e({ key: "c3", result: "won", pnl: 14, settledAt: NOW - 3_600_000, mark: null, live: null }), e({ key: "c4", result: "lost", pnl: -25, settledAt: NOW - 7_200_000, mark: null, live: null })], NOW);
    expect(t).toEqual({ title: "Your Book today", body: "1 open, $50 at risk, +$10 at Kalshi prices. Last 24 hours: 1 won (+$14), 1 lost (−$25)." });
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_book_${process.pid}`;

describe.skipIf(!URL0)("the Book in Postgres", () => {
  let admin: pg.Client, pool: pg.Pool, db: Db;
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("copies and placed matches in one Book; unanswered matches wait apart; fills corrected", async () => {
    const now = Date.now();
    await db.insert(schema.betCopies).values({ userId: "u1", betId: "pm:c", marketId: "0xm", title: "Heat vs. Lakers", outcome: "Heat", outcomeSide: "yes", tier: "millionaire",
      theirPrice: 0.5, price: 0.5, amount: 50, venue: "kalshi", result: "won", pnl: 50, settledAt: new Date(now) });
    const m = (o: Partial<typeof schema.autopilotMatches.$inferInsert>) => ({ ruleId: 1, userId: "u1", eventId: "pm:1", status: "sent" as const, wallet: "0x1", marketId: "0xm2", kalshiId: "K-1", kalshiUrl: "https://kalshi.com/x",
      side: "yes" as const, outcome: "Rangers", title: "Rangers vs. Devils", category: "hockey", amount: 60_000, theirPrice: 0.6, ask: 0.62, limitPrice: 0.62, contracts: 40, stake: 24.8, paperEntry: 0.63,
      tradeAt: new Date(now - 60_000), matchedAt: new Date(now - 50_000), latencyMs: 6_000, ...o });
    const [a] = await db.insert(schema.autopilotMatches).values(m({})).returning();
    const [b] = await db.insert(schema.autopilotMatches).values(m({ eventId: "pm:2" })).returning();
    await db.insert(schema.autopilotMatches).values(m({ eventId: "pm:3", status: "skipped", reason: "Skipped: too late", limitPrice: null, contracts: null }));
    await db.insert(schema.autopilotMatches).values(m({ eventId: "pm:4", userId: "u2" }));

    let book = await bookFor(db, "u1", now);
    expect(book.pending.map(p => p.eventId).sort()).toEqual(["pm:1", "pm:2"]);
    expect(book.entries.map(x => x.key)).toEqual(["c1"]);

    expect(await markMatch(db, "u1", a!.id, "placed", 0.61)).toBe(true);
    expect(await markMatch(db, "u1", b!.id, "skipped", null)).toBe(true);
    expect(await markMatch(db, "u2", a!.id, "skipped", null)).toBe(false); // not theirs
    book = await bookFor(db, "u1", now);
    expect(book.pending).toEqual([]);
    const placed = book.entries.find(x => x.kind === "match")!;
    expect(placed).toMatchObject({ price: 0.61, contracts: 40, cost: 24.4, result: null, category: "hockey" });

    // A copy's fill corrected: re-settled at it.
    expect(await correctCopy(db, "u1", book.entries.find(x => x.kind === "copy")!.id, 0.4)).toBe(true);
    const copy = (await bookFor(db, "u1", now)).entries.find(x => x.kind === "copy")!;
    expect(copy.price).toBe(0.4);
    expect(copy.pnl).toBeCloseTo(50 / 0.4 - 50);
  });
});
