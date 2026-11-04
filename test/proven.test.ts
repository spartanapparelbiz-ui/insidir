/* Proven wallets (lib/millionaires/proven.ts) and the nearest Kalshi lines (lib/twins/nearest.ts). */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { provenReason, screenTrades, screenWallets, settledCount, type Trade } from "@/lib/millionaires/proven";
import { lineOf, nearestLines } from "@/lib/twins/nearest";
import type { VMarket } from "@/lib/types";

const H = 3_600_000, D = 86_400_000;
const t = (m: string, side: "yes" | "no", at: number, buy = true): Trade => ({ marketId: m, outcomeSide: side, side: buy ? "BUY" : "SELL", at });

describe("proven wallets", () => {
  it("a picker passes: one side per market", () => {
    const trades = Array.from({ length: 20 }, (_, i) => t(`m${i}`, i % 2 ? "yes" : "no", i * D / 2));
    expect(screenTrades(trades).reason).toBeNull();
    expect(provenReason(screenTrades(trades), 41)).toBeNull();
    expect(provenReason(screenTrades(trades), 12)).toBe("under 30 settled");
    expect(provenReason(screenTrades(trades), null)).toBe("under 30 settled");
    // Settled: the larger of the record and the closed-market count; null only when neither has been read.
    expect(settledCount(12, 340)).toBe(340);
    expect(settledCount(null, 31)).toBe(31);
    expect(settledCount(41, null)).toBe(41);
    expect(settledCount(null, null)).toBeNull();
  });
  it("a market maker buys both sides within the hour, in 3+ markets", () => {
    const trades = ["a", "b", "c"].flatMap((m, i) => [t(m, "yes", i * D), t(m, "no", i * D + 20 * 60_000)]);
    expect(screenTrades(trades).reason).toBe("market maker");
    // Both sides days apart in only two markets: not a market maker.
    expect(screenTrades(["a", "b"].flatMap((m, i) => [t(m, "yes", i * D), t(m, "no", i * D + 5 * H)])).reason).toBeNull();
  });
  it("300+ trades in a day is high frequency", () => {
    expect(screenTrades(Array.from({ length: 300 }, (_, i) => t(`m${i % 50}`, "yes", i * 60_000))).reason).toBe("high frequency");
  });
  it("arbitrage: both sides held in 40%+ of 10+ markets, hours apart", () => {
    const trades = Array.from({ length: 10 }, (_, i) => [t(`m${i}`, "yes", i * D), ...(i < 5 ? [t(`m${i}`, "no", i * D + 6 * H)] : [])]).flat();
    expect(screenTrades(trades).reason).toBe("arbitrage");
  });
});

describe("the nearest Kalshi lines when the exact one isn't listed", () => {
  const tot = JSON.parse(readFileSync("test/fixtures/twins/nba-total.json", "utf8")) as { kalshi: VMarket[] };
  it("reads the line from the title", () => {
    expect(lineOf("Heat vs. Lakers: O/U 259.5")).toEqual({ kind: "total", line: 259.5, team: null });
    expect(lineOf("Spread: Lakers (-7.5)")).toEqual({ kind: "spread", line: 7.5, team: "Lakers" });
    expect(lineOf("Lakers vs. Heat")).toBeNull();
  });
  it("one line below and one above, never the same number", () => {
    const lines = tot.kalshi.map(m => m.ids?.floorStrike).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
    const mid = lines[Math.floor(lines.length / 2)]! + 1; // a line Kalshi doesn't list
    const near = nearestLines(tot.kalshi, { kind: "total", line: mid, teamCode: null });
    expect(near.map(n => n.line)).toEqual([mid - 1, mid + 1].map(x => lines.reduce((b, l) => Math.abs(l - x) < Math.abs(b - x) ? l : b)));
    expect(near.every(n => n.line !== mid && n.url.startsWith("https://kalshi.com"))).toBe(true);
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_proven_${process.pid}`;

describe.skipIf(!URL0)("the screen in Postgres", () => {
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

  it("judges a wallet only once its closed-market count is read; restores short records judged without one", async () => {
    const now = Date.now(), W = (n: number) => `0x${String(n).padStart(40, "0")}`;
    await db.insert(schema.watchlist).values([
      { wallet: W(1), tier: "millionaire", pnl: 3e6, refreshedAt: new Date(now) },                       // 200 closed: proven
      { wallet: W(2), tier: "millionaire", pnl: 2e6, refreshedAt: new Date(now) },                       // 12 closed: under 30
      { wallet: W(3), tier: "millionaire", pnl: 2e6, refreshedAt: new Date(now) },                       // no count yet: not judged
      { wallet: W(4), tier: "pro", pnl: 2e6, refreshedAt: new Date(now), exclusion: "under 30 settled", screenedAt: new Date(now - D), settled: 12 }, // judged before, no count: restored
    ]);
    await db.insert(schema.walletPnl).values([{ wallet: W(1), closed: 200, pnl: 3e6, readAt: new Date(now) }, { wallet: W(2), closed: 12, pnl: 2e6, readAt: new Date(now) }]);
    await db.insert(schema.traderRecords).values({ wallet: W(2), resolved: 4, won: 2, lost: 2, profit: 1, biggestWin: 1, updatedAt: new Date(now) });
    const r = await screenWallets(db, { trades: async () => [] }, now);
    expect(r).toEqual({ screened: 2, proven: 1, excluded: 1 });
    const rows = new Map((await db.select().from(schema.watchlist)).map(x => [x.wallet, [x.tier, x.exclusion, x.settled]]));
    expect(rows.get(W(1))).toEqual(["millionaire", null, 200]);
    expect(rows.get(W(2))).toEqual(["pro", "under 30 settled", 12]);
    expect(rows.get(W(3))).toEqual(["millionaire", null, null]);
    expect(rows.get(W(4))).toEqual(["millionaire", null, 12]);
  });
});
