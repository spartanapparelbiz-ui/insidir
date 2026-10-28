/* The hourly accuracy check against a real Postgres (a throwaway database next to E2E_DATABASE_URL): a move that
 * doesn't match its source is hidden from every list until a later check passes; a source that can't be reached
 * hides nothing; every line is stored for /admin. Plus the source links on cards and profiles. The DB part is skipped
 * when E2E_DATABASE_URL isn't set. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accuracyEmail, runAccuracyCheck, type Sources } from "@/lib/accuracy/check";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { txHashes } from "@/lib/moves/detect";
import { moveSource, profileSource } from "@/lib/moves/source";
import { listMoves, moveById, upsertMoves } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_acc_${process.pid}`;
const NOW = Date.UTC(2026, 9, 26, 18, 0, 0);
const W = `0x${"1".padStart(40, "0")}`;
const TX = `0x${"a".repeat(64)}`;

describe("source links", () => {
  it("a Polymarket move links its Polygon transaction, else the wallet; Kalshi its trade record; SEC its filing", () => {
    const base = { id: "pm:x", source: "polymarket" as const, marketId: "0xc1", wallet: W, at: NOW, url: "https://polymarket.com/event/x" };
    expect(moveSource({ ...base, sourceRefs: [TX] })).toEqual({ href: `https://polygonscan.com/tx/${TX}`, label: "Where this comes from: Polymarket trade on Polygon" });
    expect(moveSource({ ...base, sourceRefs: null })?.href).toBe(`https://polygonscan.com/address/${W}`);
    expect(moveSource({ ...base, id: "ks:t1", source: "kalshi", marketId: "KX-1", wallet: null })?.href).toMatch(/\/markets\/trades\?ticker=KX-1&min_ts=\d+&max_ts=\d+$/);
    expect(moveSource({ ...base, source: "sec", url: "https://www.sec.gov/Archives/edgar/data/1/0001/" })?.label).toBe("Where this comes from: SEC EDGAR filing");
    // Never an international Polymarket link: the source is the public chain.
    expect(moveSource({ ...base, sourceRefs: [TX] })?.href).not.toMatch(/polymarket\.com/);
    expect(profileSource({ kind: "insider", cik: "888888" }).href).toContain("CIK=0000888888&type=4");
    expect(profileSource({ kind: "fund", cik: "999998" }).href).toContain("type=13F-HR");
  });
  it("keeps each transaction hash from the fill ids once", () => {
    expect(txHashes([{ id: `${TX}:${W}:c:0:1` }, { id: `${TX}:${W}:c:0:2` }, { id: `tx:${W}:c:0:3` }])).toEqual([TX]);
  });
});

let admin: pg.Client, pool: pg.Pool, db: Db;

describe.skipIf(!URL0)("the accuracy check in Postgres", () => {
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
  beforeEach(async () => { await db.execute(`truncate terminal.moves, terminal.accuracy_checks`); });

  const move = (id: string, market: string, amount: number): Move => ({
    id, source: "polymarket", marketId: market, eventTitle: "Chiefs vs Bills", marketTitle: "Chiefs vs Bills", outcome: "Chiefs", outcomeSide: "yes",
    amount, avgPrice: 0.5, wallet: W, walletName: null, at: NOW - 3_600_000, lastAt: NOW - 3_600_000, fills: 1, tab: "sports", league: "NFL",
    category: "sports", url: null, result: null, settledAt: null, sourceRefs: [TX],
  });
  /** The Data API's trades for a wallet in a market: one $50,000 buy of Chiefs at 50¢ in each market. */
  const poly = (fail = false) => ({
    getWalletMarketTradesAll: async (_user: string, market: string) => {
      if (fail) throw new Error("ECONNRESET");
      return [{ proxyWallet: W, side: "BUY", size: 100_000, price: 0.5, timestamp: (NOW - 3_600_000) / 1000, conditionId: market, outcomeIndex: 0, outcome: "Chiefs", transactionHash: TX, title: "Chiefs vs Bills" }];
    },
  }) as unknown as PolymarketClient;
  const src = (fail = false): Sources => ({ poly: poly(fail), kalshi: {} as KalshiClient, sec: null });

  it("hides a move that doesn't match, keeps one that does, stores every line, and shows it again once it matches", async () => {
    await upsertMoves(db, [move("pm:good", "C1", 50_000), { ...move("pm:bad", "C2", 50_000), outcome: "Bills" }]);
    const run = await runAccuracyCheck(db, src(), { moves: 10, profiles: 0, now: NOW });
    expect(run.lines.map(l => [l.target, l.status]).sort()).toEqual([["pm:bad", "mismatch"], ["pm:good", "ok"]]);
    expect(run.hidden).toEqual(["pm:bad"]);
    expect((await listMoves(db, {})).map(m => m.id)).toEqual(["pm:good"]);
    expect(await moveById(db, "pm:bad")).toBeNull();
    const stored = (await db.execute(`select target, status, problems from terminal.accuracy_checks order by target`)).rows;
    expect(stored).toEqual([
      { target: "pm:bad", status: "mismatch", problems: ["outcome Bills vs Chiefs"] },
      { target: "pm:good", status: "ok", problems: [] },
    ]);
    const email = accuracyEmail(run, "https://insidir.com");
    expect(email?.subject).toBe("Insidir accuracy check: 1 thing doesn't match the source");
    expect(email?.lines.some(l => l.text.includes("outcome Bills vs Chiefs"))).toBe(true);

    // The stored move is corrected; the next run shows it again.
    await db.execute(`update terminal.moves set outcome = 'Chiefs' where id = 'pm:bad'`);
    const again = await runAccuracyCheck(db, src(), { moves: 10, profiles: 0, now: NOW + 3_600_000 });
    expect(again.restored).toEqual(["pm:bad"]);
    expect((await listMoves(db, {})).map(m => m.id).sort()).toEqual(["pm:bad", "pm:good"]);
  });

  it("a Polymarket position off in size is rebuilt from the wallet's fills, not hidden; a hidden one comes back rebuilt; a sell stays hidden", async () => {
    await upsertMoves(db, [move("pm:short", "C1", 30_000), move("pm:hid", "C2", 80_000), move("pm:sell", "C3", 80_000)]);
    await db.execute(`update terminal.moves set hidden_at = now(), hidden_reason = 'amount 80000 vs source 50000.00' where id = 'pm:hid'`);
    await db.execute(`update terminal.moves set hidden_at = now(), hidden_reason = 'Not a new bet: the wallet was selling or closing a position' where id = 'pm:sell'`);
    await db.execute(`update terminal.moves set realized_at = now(), pnl = 1 where id = 'pm:short'`);
    // Stored as starting half a second after its real first fill: no fills in the stored window, still rebuilt.
    await db.execute(`update terminal.moves set at = at + interval '500 milliseconds', last_at = at + interval '500 milliseconds' where id = 'pm:hid'`);
    const run = await runAccuracyCheck(db, src(), { moves: 10, profiles: 0, now: NOW });
    const by = new Map(run.lines.map(l => [l.target, l]));
    expect(by.get("pm:short")).toMatchObject({ status: "ok", problems: ["rebuilt from the source (amount 30000 vs source 50000.00)"] });
    expect(by.get("pm:hid")?.status).toBe("ok");
    expect(by.get("pm:sell")?.status).toBe("mismatch");
    expect(run.hidden).toEqual([]);
    expect(run.restored).toEqual(["pm:hid"]);
    const rows = (await db.execute(`select id, amount, fills, realized_at, pnl, parts, hidden_at from terminal.moves order by id`)).rows as Array<Record<string, unknown>>;
    const row = (id: string) => rows.find(r => r.id === id)!;
    expect(row("pm:short")).toMatchObject({ amount: 50_000, fills: 1, realized_at: null, pnl: null, hidden_at: null });
    expect(row("pm:short").parts).toEqual([{ id: expect.stringContaining(TX), c: 100_000, p: 0.5, at: NOW - 3_600_000 }]);
    expect(row("pm:hid")).toMatchObject({ amount: 50_000, hidden_at: null });
    expect(row("pm:sell")).toMatchObject({ amount: 80_000 });
    expect(row("pm:sell").hidden_at).not.toBeNull();
    expect((await listMoves(db, {})).map(m => m.id).sort()).toEqual(["pm:hid", "pm:short"]);
  });

  it("checks a Kalshi trade by id, without needing the market stored, and restores it if it was hidden", async () => {
    const at = NOW - 3_600_000;
    const k: Move = { ...move("ks:T-1", "KX-CLE", 5_013), source: "kalshi", wallet: null, outcome: "No", outcomeSide: "no", at, lastAt: at, sourceRefs: null };
    await upsertMoves(db, [k]);
    await db.execute(`update terminal.moves set hidden_at = now(), hidden_reason = 'market not in terminal.markets' where id = 'ks:T-1'`);
    const kalshi = { getTradesPage: async (o: { ticker?: string }) => ({ trades: [{ trade_id: "T-1", ticker: o.ticker, created_time: new Date(at).toISOString(), taker_side: "no", count: 10_026, no_price: 50, yes_price: 50 }] }) } as unknown as KalshiClient;
    const run = await runAccuracyCheck(db, { poly: poly(), kalshi, sec: null }, { moves: 10, profiles: 0, now: NOW });
    expect(run.lines.find(l => l.target === "ks:T-1")).toMatchObject({ status: "ok", problems: [] });
    expect(run.restored).toEqual(["ks:T-1"]);
  });

  it("a source that can't be reached is skipped, never hidden, and sends no email", async () => {
    await upsertMoves(db, [move("pm:good", "C1", 50_000)]);
    const run = await runAccuracyCheck(db, src(true), { moves: 10, profiles: 0, now: NOW });
    expect(run.lines[0]).toMatchObject({ status: "skipped", problems: [expect.stringContaining("source unavailable")] });
    expect(run.hidden).toEqual([]);
    expect((await listMoves(db, {})).length).toBe(1);
    expect(accuracyEmail(run, "https://insidir.com")).toBeNull();
  });
});
