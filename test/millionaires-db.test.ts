/* The millionaire watchlist and bets against a throwaway Postgres next to E2E_DATABASE_URL: the daily refresh replaces
 * the list and refreshes wallet_pnl (queueing wallets it doesn't hold), bets upsert in place and settle with their
 * market, visitors see bets an hour late while counts stay live, money splits per tier and side, and the proof stat
 * switches from the tracker record to the millionaires' own once 30 of their bets settled. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { saveBets, type BetRow } from "@/lib/millionaires/bets";
import { liveCategories, marketMoney, midnightET, positions, proof, pulse, recentBets, topWallets, VISITOR_DELAY_MS } from "@/lib/millionaires/queries";
import { refreshWatchlist } from "@/lib/millionaires/watchlist";
import { settleMarket, unsettledMarkets } from "@/lib/moves/store";
import { clearMemo } from "@/lib/memo";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_millionaires_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const NOW = Date.now(), MIN = 60_000;
const W = (i: number) => "0x" + i.toString(16).padStart(40, "0");

const board = (n: number, top = 3e6, step = 2500) => ({
  getLeaderboardPage: async (o: { cursor?: string | null; limit?: number }) => {
    const page = o.cursor ? Number(o.cursor) : 0;
    const data = Array.from({ length: o.limit! }, (_, i) => ({ user_id: W(page * 100 + i + 1), pnl: top - (page * 100 + i) * step, user_name: "secret" })).filter((_, i) => page * 100 + i < n);
    return { data, pagination: { has_more: (page + 1) * 100 < n, next_cursor: String(page + 1) } };
  },
});

const bet = (id: string, o: Partial<BetRow> & { wallet: string; minsAgo: number }): BetRow => ({
  id, tier: "millionaire", source: "polymarket", marketId: "0xm1", eventTitle: "NFL: Chiefs vs Bills", marketTitle: "Will the Chiefs win?", outcome: "Yes", outcomeSide: "yes",
  amount: 10_000, price: 0.4, category: "football", url: null, at: new Date(NOW - o.minsAgo * MIN), lastAt: new Date(NOW - o.minsAgo * MIN), ...o,
});

describe.skipIf(!URL0)("millionaires, in Postgres", () => {
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
    await pool.query("truncate terminal.watchlist, terminal.millionaire_bets, terminal.wallet_pnl, terminal.wallet_pnl_queue, terminal.market_info, terminal.moves");
    clearMemo();
  });

  it("refreshes the watchlist: every wallet up $100K+ replaced, tiers set, wallet_pnl refreshed, new wallets queued, no names kept", async () => {
    await pool.query(`insert into terminal.watchlist values ('${W(99999)}', 'pro', 200000, now())`);
    await pool.query(`insert into terminal.wallet_pnl (wallet, closed, pnl, read_at) values ('${W(1)}', 40, 5, now())`);
    const r = await refreshWatchlist(db, board(1200), NOW);
    expect(r).toEqual({ wallets: 1161, millionaires: 801 }); // every wallet up $100K+ (the 1,200-wallet board's first 1,161)
    const w = await pool.query("select count(*)::int n, count(*) filter (where tier = 'millionaire')::int m from terminal.watchlist");
    expect(w.rows[0]).toEqual({ n: 1161, m: 801 });
    expect((await pool.query(`select 1 from terminal.watchlist where wallet = '${W(99999)}'`)).rowCount).toBe(0);
    expect((await pool.query(`select pnl, closed from terminal.wallet_pnl where wallet = '${W(1)}'`)).rows[0]).toEqual({ pnl: 3e6, closed: 40 });
    expect((await pool.query("select count(*)::int n from terminal.wallet_pnl_queue")).rows[0].n).toBe(1160);
    const cols = (await pool.query("select column_name from information_schema.columns where table_schema = 'terminal' and table_name = 'watchlist'")).rows.map(x => x.column_name);
    expect(cols.sort()).toEqual(["exclusion", "pnl", "refreshed_at", "screen", "screened_at", "settled", "tier", "wallet"]); // no name or face columns
  });

  it("a short leaderboard read keeps yesterday's list", async () => {
    await pool.query(`insert into terminal.watchlist values ('${W(5)}', 'pro', 200000, now())`);
    await expect(refreshWatchlist(db, board(300), NOW)).rejects.toThrow(/only 300/);
    expect((await pool.query("select count(*)::int n from terminal.watchlist")).rows[0].n).toBe(1);
  });

  it("bets: upsert in place, visitors an hour late, live counts, money per tier and side, settle with the market", async () => {
    await pool.query(`insert into terminal.watchlist values ('${W(1)}', 'millionaire', 2400000, now()), ('${W(2)}', 'millionaire', 1500000, now()), ('${W(3)}', 'pro', 300000, now()), ('${W(4)}', 'millionaire', 1100000, now())`);
    await saveBets(db, [bet("b1", { wallet: W(1), minsAgo: 10 }), bet("b2", { wallet: W(2), minsAgo: 90, amount: 20_000 }), bet("b3", { wallet: W(3), minsAgo: 30, tier: "pro", outcomeSide: "no", outcome: "No", amount: 8000 }),
      bet("b4", { wallet: W(4), minsAgo: 200, marketId: "0xm2", category: "politics", marketTitle: "Will the bill pass?", eventTitle: "Congress" })]);
    await saveBets(db, [bet("b1", { wallet: W(1), minsAgo: 10, amount: 15_000, tier: "pro" })]); // grew; the tier it had stays
    await pool.query(`insert into terminal.market_info (source, market_id, yes_price) values ('polymarket', '0xm1', 0.55)`);

    const live = await recentBets(db, { now: NOW, member: true });
    expect(live.map(b => b.id)).toEqual(["b1", "b3", "b2", "b4"]);
    expect(live[0]).toMatchObject({ amount: 15_000, tier: "millionaire", priceThen: 0.4, category: "football", short: "0x0000…0001" });
    expect(live[0]!.priceNow).toBeCloseTo(0.55);
    expect(live[1]!.priceNow).toBeCloseTo(0.45); // the NO side
    const late = await recentBets(db, { now: NOW, delayMs: VISITOR_DELAY_MS });
    expect(late.map(b => b.id)).toEqual(["b2", "b4"]);
    // A visitor gets every bet but never its side (nor the prices that would give it away, nor the full wallet).
    const visitor = await recentBets(db, { now: NOW });
    expect(visitor.map(b => b.id)).toEqual(["b1", "b3", "b2", "b4"]);
    for (const b of visitor) expect([b.wallet, b.outcome, b.side, b.priceThen, b.priceNow]).toEqual([null, null, null, null, null]);
    expect(visitor[0]).toMatchObject({ amount: 15_000, tier: "millionaire", pnl: 2_400_000, short: "0x0000…0001" });

    const pl = await pulse(db, NOW);
    expect(pl).toMatchObject({ count: 1, window: "hour", wallets: 4, millionaires: 3, today: 35_000 + 10_000 });
    // Since midnight ET: some or all of today's (when midnight was within the last few hours, fewer).
    expect(pl.sinceMidnight).toBeLessThanOrEqual(pl.today);
    expect(pl.countToday).toBeLessThanOrEqual(3);
    if (NOW - midnightET(NOW) > 4 * 3_600_000) expect([pl.sinceMidnight, pl.countToday]).toEqual([45_000, 3]);
    const cats = await liveCategories(db, NOW);
    expect(cats.window).toBe("day");
    expect(cats.list[0]).toMatchObject({ slug: "football", millionaire: 35_000, pro: 8000, markets: 1 });

    const [m] = await marketMoney(db, { marketIds: ["0xm1"], now: NOW });
    expect(m!.millionaire).toEqual({ yes: { dollars: 35_000, wallets: 2 }, no: { dollars: 0, wallets: 0 } });
    expect(m!.pro.no).toEqual({ dollars: 8000, wallets: 1 });
    expect((await positions(db, "0xm1")).map(p => p.short)).toEqual(["0x0000…0002", "0x0000…0001", "0x0000…0003"]);
    expect((await topWallets(db, ["football"], NOW))[0]).toMatchObject({ short: "0x0000…0002", tier: "millionaire", pnl: 1_500_000 });

    // Markets holding only millionaire bets are checked for settlement, then settle.
    expect(await unsettledMarkets(db, new Date(NOW))).toEqual(expect.arrayContaining([{ source: "polymarket", marketId: "0xm1" }]));
    await settleMarket(db, "polymarket", "0xm1", "yes", new Date(NOW));
    const res = await pool.query("select id, result from terminal.millionaire_bets where market_id = '0xm1' order by id");
    expect(res.rows).toEqual([{ id: "b1", result: "won" }, { id: "b2", result: "won" }, { id: "b3", result: "lost" }]);
  });

  it("proof: the millionaires' own record once 30 settled, else none (no tracker record here)", async () => {
    expect(await proof(db, NOW)).toBeNull();
    await pool.query(`insert into terminal.watchlist values ('${W(1)}', 'millionaire', 2400000, now())`);
    await saveBets(db, Array.from({ length: 30 }, (_, i) => bet(`s${i}`, { wallet: W(1), minsAgo: 100 + i, marketId: `0xs${i}`, price: 0.49, result: i < 20 ? "won" : "lost" })));
    clearMemo();
    const p = await proof(db, NOW);
    expect(p).toMatchObject({ kind: "millionaire", label: "millionaire bet", record: { n: 30, won: 20, lost: 10, staked: 3000 } });
    expect(p!.record.net).toBeCloseTo(20 * (100 / 0.5) - 3000);
  });
});
