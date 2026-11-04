/* The proven-wallet backfill (lib/moves/proven-backfill.ts) against a throwaway Postgres next to E2E_DATABASE_URL:
 * the order (queued by a Read first; then open positions in markets starting or closing in the next 72 hours, most
 * open dollars first; then newest first), the on-demand queue from a Read (all queued, up to 5 read inline within the
 * budget, the rest first in line), a slow venue never holding a Read, a wallet past the page cap kept as "at least",
 * and the request budget that grows on clean runs and halves on a 429. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { RECORD_MAX_PAGES } from "@/lib/moves/jobs";
import { budgetFor, enqueueWallets, INLINE_MAX, nextShare, PROVEN_RECORD_TTL_MS, provenBackfillOnce, resetShare, SHARE_MAX, SHARE_MIN, SHARE_START, walletsToBackfill } from "@/lib/moves/proven-backfill";
import { recordsFor, saveWalletPnl, walletPnlFor } from "@/lib/moves/store";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_backfill_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const H = 3_600_000, DAY = 24 * H, NOW = Date.now();
const W = (c: string) => "0x" + c.repeat(40).slice(0, 40);
const [A, B, C, D, E, F, Q1, Q2] = ["a", "b", "c", "d", "e", "f", "1", "2"].map(W) as [string, string, string, string, string, string, string, string];

async function move(id: string, o: { market: string; wallet: string; amount: number; at: number; result?: "won" | "lost" | null }) {
  await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, category, result)
    values ($1, 'polymarket', $2, 'Fixture', 'Fixture', 'Yes', 'yes', $3, 0.5, $4, $5, $5, 'sports', 'sports', $6)`, [id, o.market, o.amount, o.wallet, new Date(o.at), o.result ?? null]);
}
const info = (market: string, o: { start?: number; end?: number }) =>
  pool.query(`insert into terminal.market_info (source, market_id, start_at, end_at) values ('polymarket', $1, $2, $3)`, [market, o.start ? new Date(o.start) : null, o.end ? new Date(o.end) : null]);

/** A Data API stand-in: `closed` closed markets per wallet (full pages past the cap), pnl per wallet, optional delay. */
function fakePoly(o: { closed: (w: string) => number; pnl: (w: string) => number | null; delayMs?: number }) {
  const calls: string[] = [];
  const wait = () => new Promise(ok => setTimeout(ok, o.delayMs ?? 0));
  return {
    calls,
    // /v2/positions?status=CLOSED pages by cursor (here the cursor is the next offset); rows in v1 names (v1Position).
    getClosedPositionsPage: async (w: string, q: { cursor?: string | null } = {}) => {
      calls.push(`closed:${w}`); await wait();
      const off = Number(q.cursor ?? 0), n = Math.max(0, Math.min(50, o.closed(w) - off)), more = off + n < o.closed(w);
      return { data: Array.from({ length: n }, (_, i) => ({ conditionId: `0xm${off + i}`, outcomeIndex: 0, title: "M", avgPrice: 0.5, totalBought: 10, realizedPnl: 1, timestamp: NOW / 1000 })), pagination: { has_more: more, next_cursor: more ? String(off + n) : null } };
    },
    // /v2/leaderboard answers a user lookup with one object.
    getLeaderboardUser: async (w: string) => { calls.push(`board:${w}`); await wait(); const p = o.pnl(w); return p === null ? { data: null } : { data: { rank_pnl: 9, user_id: w, user_name: "x", volume: 1, pnl: p } }; },
  };
}

describe.skipIf(!URL0)("proven-wallet backfill, in Postgres", () => {
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
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });
  beforeEach(async () => {
    await pool.query("truncate terminal.moves, terminal.market_info, terminal.wallet_pnl, terminal.wallet_pnl_queue, terminal.markets, terminal.pairs");
    resetShare();
  });

  it("order: queued by a Read first (oldest first); then open money in markets within 72 hours, most first; then newest first", async () => {
    // A: $50K open in tonight's game (starts in 5 hours). B: $200K open in Tuesday's election (closes in 48 hours).
    // C: $10K open in a market 10 days out, but the newest move. D: settled, 5 days ago. E: 100 days ago (out).
    // F: $500K open in the election, but read an hour ago (not due). Q2 then Q1 queued by Reads, with no moves at all.
    await move("a1", { market: "0xgame", wallet: A, amount: 50_000, at: NOW - 2 * H });
    await move("b1", { market: "0xelect", wallet: B, amount: 200_000, at: NOW - 3 * DAY });
    await move("b2", { market: "0xgame", wallet: B, amount: 1_000, at: NOW - 3 * DAY, result: "won" }); // settled: not open money
    await move("c1", { market: "0xlater", wallet: C, amount: 10_000, at: NOW - H });
    await move("d1", { market: "0xold", wallet: D, amount: 30_000, at: NOW - 5 * DAY, result: "lost" });
    await move("e1", { market: "0xancient", wallet: E, amount: 90_000, at: NOW - 100 * DAY });
    await move("f1", { market: "0xelect", wallet: F, amount: 500_000, at: NOW - H });
    await info("0xgame", { start: NOW + 5 * H, end: NOW + 30 * DAY });
    await info("0xelect", { end: NOW + 48 * H });
    await info("0xlater", { end: NOW + 10 * DAY });
    await saveWalletPnl(db, F, { closed: 40, closedAtLeast: false, pnl: 100 }, NOW - H);
    await enqueueWallets(db, [Q2], NOW - 10 * 60_000);
    await enqueueWallets(db, [Q1], NOW - 5 * 60_000);
    expect(await walletsToBackfill(db, NOW, PROVEN_RECORD_TTL_MS, 10)).toEqual([Q2, Q1, B, A, C, D]);
    // A queued wallet keeps its place when queued again.
    await enqueueWallets(db, [Q2, Q1], NOW);
    expect((await walletsToBackfill(db, NOW, PROVEN_RECORD_TTL_MS, 2))).toEqual([Q2, Q1]);
    // A day later F is due again: first among the 72-hour wallets ($500K in the election). Tonight's game has started,
    // so A is back with the rest, newest first.
    expect(await walletsToBackfill(db, NOW + 25 * H, PROVEN_RECORD_TTL_MS, 10)).toEqual([Q2, Q1, F, B, C, A, D]);
  });

  it("a wallet past the page cap is kept as \"at least\", with pnl from its own leaderboard row; trader_records untouched", async () => {
    await move("c1", { market: "0xm", wallet: C, amount: 10_000, at: NOW - H });
    await move("d1", { market: "0xm", wallet: D, amount: 10_000, at: NOW - 2 * H });
    const poly = fakePoly({ closed: w => (w === C ? 1e9 : 35), pnl: w => (w === C ? 1_234_567.891 : null) });
    const run = await provenBackfillOnce(db, poly, NOW, 10_000);
    expect(poly.calls.filter(c => c === `closed:${C}`)).toHaveLength(RECORD_MAX_PAGES);
    const got = await walletPnlFor(db, [C, D]);
    expect(got.get(C)).toEqual({ closed: RECORD_MAX_PAGES * 50, closedAtLeast: true, pnl: 1_234_567.89 });
    expect(got.get(D)).toEqual({ closed: 35, closedAtLeast: false, pnl: null }); // no leaderboard row: no profit
    expect(run).toMatchObject({ wallets: 2, requests: RECORD_MAX_PAGES + 1 + 2, rateLimited: 0, queued: 0, due: 0, share: SHARE_START });
    expect(run.reqPerSec).toBeGreaterThan(0);
    expect((await recordsFor(db, [C, D])).size).toBe(0);
  });

  it("the request budget: the Data API rate × share × run length; the share grows on clean runs and halves after a 429", () => {
    expect(budgetFor(12, 0.5, 50_000)).toBe(300);
    expect(nextShare(SHARE_START, 0)).toBe(0.6);
    expect(nextShare(SHARE_MAX, 0)).toBe(SHARE_MAX);
    expect(nextShare(0.6, 3)).toBe(0.3);
    expect(nextShare(SHARE_MIN, 1)).toBe(SHARE_MIN);
  });
});
