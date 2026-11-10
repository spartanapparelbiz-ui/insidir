/* The tape (lib/tape.ts) against a throwaway Postgres next to E2E_DATABASE_URL: every kind merged newest first, whales are
 * wallets outside the watchlist, visitors 60 minutes late with no side, outcome or price, and the big money per market. */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { tape } from "@/lib/tape";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_tape_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const NOW = Date.now(), MIN = 60_000;
const W = (i: number) => "0x" + i.toString(16).padStart(40, "0");
const ago = (m: number) => new Date(NOW - m * MIN);

describe.skipIf(!URL0)("the tape, in Postgres", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    await db.insert(schema.watchlist).values([{ wallet: W(1), tier: "millionaire", pnl: 2e6, refreshedAt: new Date(NOW) }, { wallet: W(2), tier: "pro", pnl: 4e5, refreshedAt: new Date(NOW) }]);
    await db.insert(schema.traderRecords).values({ wallet: W(1), resolved: 30, won: 20, lost: 10, profit: 2e6, biggestWin: 1, updatedAt: new Date(NOW) });
    const bet = (id: string, wallet: string, tier: "millionaire" | "pro", m: number, side: "yes" | "no", amount: number) => ({ id, wallet, tier, source: "polymarket" as const, marketId: "0xm1",
      eventTitle: "Bills vs. Vikings", marketTitle: "Bills vs. Vikings", outcome: side === "yes" ? "Bills" : "Vikings", outcomeSide: side, amount, price: 0.55, category: "football", url: null, at: ago(m), lastAt: ago(m) });
    await db.insert(schema.millionaireBets).values([bet("b1", W(1), "millionaire", 5, "yes", 20_000), bet("b2", W(2), "pro", 90, "no", 3_000)]);
    await db.insert(schema.positionEvents).values({ id: "ps:1", wallet: W(1), tier: "millionaire", marketId: "0xm1", outcomeSide: "yes", outcome: "Bills", marketTitle: "Bills vs. Vikings",
      eventTitle: "Bills vs. Vikings", category: "football", url: null, kind: "exit", amount: 12_000, price: 0.6, shares: 20_000, heldAfter: 0, at: ago(70), lastAt: ago(70) });
    const move = (id: string, source: "polymarket" | "kalshi", wallet: string | null, m: number, amount: number) => ({ id, source, marketId: source === "kalshi" ? "KX-1" : "0xm2", eventTitle: "E", marketTitle: "Lakers vs. Hawks",
      outcome: "Lakers", outcomeSide: "yes" as const, amount, avgPrice: 0.5, wallet, walletName: null, at: ago(m), lastAt: ago(m), fills: 1, tab: "sports" as const, league: null, category: "basketball", url: null });
    await db.insert(schema.moves).values([move("w1", "polymarket", W(9), 80, 25_000), move("w2", "polymarket", W(1), 75, 30_000), move("k1", "kalshi", null, 100, 8_000)]);
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("members: every kind, newest first, sides and prices, the wallet's record and the big money per side", async () => {
    const rows = await tape(db, { now: NOW, member: true });
    expect(rows.map(r => r.id)).toEqual(["b1", "ps:1", "w1", "b2", "k1"]); // w2 is a watched wallet: it's already a bet, not a whale
    const b1 = rows[0]!;
    expect(b1).toMatchObject({ kind: "bet", tier: "millionaire", pnl: 2e6, record: { won: 20, lost: 10 }, side: "yes", outcome: "Bills", price: 0.55, amount: 20_000 });
    expect(b1.market).toEqual({ total: 23_000, wallets: 2, yes: 20_000, no: 3_000 });
    expect(rows.find(r => r.id === "ps:1")).toMatchObject({ kind: "exit", outcome: "Bills", price: 0.6 });
    expect(rows.find(r => r.id === "w1")).toMatchObject({ kind: "whale", tier: "whale", short: "0x0000…0009" });
    expect(rows.find(r => r.id === "k1")).toMatchObject({ kind: "kalshi", tier: null, short: null, href: null });
  });

  it("visitors: 60 minutes late, never a side, an outcome or a price; the big money as a total only", async () => {
    const rows = await tape(db, { now: NOW, member: false });
    expect(rows.map(r => r.id)).toEqual(["ps:1", "w1", "b2", "k1"]); // b1 (5 minutes old) isn't there yet
    for (const r of rows) expect({ side: r.side, outcome: r.outcome, price: r.price }).toEqual({ side: null, outcome: null, price: null });
    expect(rows.find(r => r.id === "ps:1")!.market).toEqual({ total: 3_000, wallets: 1, yes: null, no: null });
  });

  it("folds a wallet's repeat trades on one market and side into one row, money-weighted", async () => {
    await db.insert(schema.millionaireBets).values([
      { id: "g1", wallet: W(1), tier: "millionaire", source: "polymarket", marketId: "0xg", eventTitle: "G", marketTitle: "Jets vs. Bears", outcome: "Jets", outcomeSide: "yes", amount: 10_000, price: 0.4, category: "football", url: null, at: ago(2), lastAt: ago(2) },
      { id: "g2", wallet: W(1), tier: "millionaire", source: "polymarket", marketId: "0xg", eventTitle: "G", marketTitle: "Jets vs. Bears", outcome: "Jets", outcomeSide: "yes", amount: 30_000, price: 0.6, category: "football", url: null, at: ago(8), lastAt: ago(8) },
      { id: "g3", wallet: W(1), tier: "millionaire", source: "polymarket", marketId: "0xg", eventTitle: "G", marketTitle: "Jets vs. Bears", outcome: "Jets", outcomeSide: "yes", amount: 5_000, price: 0.5, category: "football", url: null, at: ago(40), lastAt: ago(40) },
    ]);
    const rows = (await tape(db, { now: NOW, member: true, kinds: ["bet"] })).filter(r => r.marketId === "0xg");
    expect(rows.map(r => [r.id, r.trades, r.amount, r.big])).toEqual([["g1", 2, 40_000, true], ["g3", 1, 5_000, false]]);
    expect(rows[0]!.price).toBeCloseTo(0.55);
    await db.delete(schema.millionaireBets).where(sql`id in ('g1','g2','g3')`);
  });

  it("filters by kind", async () => {
    expect((await tape(db, { now: NOW, member: true, kinds: ["exit", "trim"] })).map(r => r.id)).toEqual(["ps:1"]);
    expect((await tape(db, { now: NOW, member: true, kinds: ["kalshi"] })).map(r => r.id)).toEqual(["k1"]);
  });
});
