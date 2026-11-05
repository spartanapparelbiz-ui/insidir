/* kalshi:asks (lib/autopilot/history.ts kalshiAsksOnce) against a throwaway Postgres: a bet priced from Kalshi's
 * candles; one Kalshi has no candle for stored with no ask; a failed or hung request stores nothing (read again later,
 * never counted off Kalshi for good); an empty row from before the fix is read again; and a run always ends.
 * Nov 4: the job hung for an hour and errors were saved as "no price". And the backtest's rows carry the site's category
 * (what rules filter on), not the move classifier's label: the report's category split was empty. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { kalshiAsksOnce, RECHECK_EMPTY_BEFORE } from "@/lib/autopilot/history";
import { backtestRows } from "@/lib/autopilot/backtest";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_asks_${process.pid}`;
const NOW = Date.now(), SEEN = NOW - 2 * 3_600_000;
let admin: pg.Client, pool: pg.Pool, db: Db;

async function bet(id: string, market: string, kalshi: string) {
  await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, seen_at, tab, category)
    values ($1, 'polymarket', $2, 'E', 'M', 'Yes', 'yes', 50000, 0.5, '0xw', $3, $3, $3, 'sports', 'basketball')`, [id, market, new Date(SEEN)]);
  await pool.query(`insert into terminal.market_twins (polymarket_id, kalshi_id, kalshi_url, polymarket_title, kalshi_title, kind, verdict, status, confidence, checks)
    values ($1, $2, 'https://kalshi.com', 'M', 'K', 'winner', 'candidate', 'approved', 0.99, '{}') on conflict do nothing`, [market, kalshi]);
}
const candle = (endMs: number, ask: number) => ({ end_period_ts: Math.floor(endMs / 1000), yes_ask: { close: ask * 100 }, yes_bid: { close: ask * 100 - 2 } });
const rows = async () => new Map((await pool.query("select move_id, ask from terminal.kalshi_history")).rows.map(r => [r.move_id as string, r.ask === null ? null : Number(r.ask)]));

describe.skipIf(!URL0)("kalshi:asks in Postgres", () => {
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
  beforeEach(async () => { await pool.query("truncate terminal.moves, terminal.market_twins, terminal.kalshi_history"); });

  it("priced, no candle, failed and hung: only real answers are stored; the run ends on time", async () => {
    await bet("priced", "0xa", "KXA-1");
    await bet("empty", "0xb", "KXB-1");
    await bet("error", "0xc", "KXC-1");
    await bet("hang", "0xd", "KXD-1");
    const src = { candles: async (_s: string, t: string) => {
      if (t === "KXA-1") return { candlesticks: [candle(SEEN - 60_000, 0.61)] };
      if (t === "KXB-1") return { candlesticks: [] };
      if (t === "KXC-1") throw new Error("429");
      return new Promise(() => {}); // never answers
    } };
    const t0 = Date.now();
    const r = await kalshiAsksOnce(db, src, NOW, 200, 4, { timeoutMs: 200, runMs: 5_000 });
    expect(Date.now() - t0).toBeLessThan(3_000);
    expect(r).toEqual({ read: 2, priced: 1, failed: 2 });
    const got = await rows();
    expect(got.get("priced")).toBe(0.61);
    expect(got.has("empty") && got.get("empty")).toBe(null);
    expect(got.has("error")).toBe(false);
    expect(got.has("hang")).toBe(false);
  });

  it("backtest rows carry the site's category: an NBA game is basketball, an election is elections", async () => {
    await pool.query("truncate terminal.trader_records");
    await pool.query(`insert into terminal.trader_records (wallet, resolved, won, lost, profit, biggest_win, updated_at) values ('0xw', 40, 25, 15, 2000000, 100000, now())`);
    for (const [id, cat, tab, title, url] of [
      ["g1", "NBA", "sports", "Heat vs. Lakers", "https://polymarket.com/event/nba-mia-lal-2026-11-04"],
      ["e1", "Markets", "markets", "Will the Democrats win the Texas Senate race in 2026?", null],
    ] as const) {
      await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, seen_price, seen_src, wallet, at, last_at, seen_at, tab, category, url)
        values ($1, 'polymarket', $1, $2, $2, 'Yes', 'yes', 50000, 0.5, 0.5, 'history', '0xw', $3, $3, $3, $4, $5, $6)`, [id, title, new Date(SEEN), tab, cat, url]);
    }
    const cats = new Map((await backtestRows(db, NOW)).map(r => [r.id, r.category]));
    expect(cats.get("g1")).toBe("basketball");
    expect(cats.get("e1")).toBe("elections");
  });

  it("an empty row from before the fix is read again; one from after is not", async () => {
    await bet("old", "0xe", "KXE-1");
    await bet("new", "0xf", "KXF-1");
    await pool.query("insert into terminal.kalshi_history (move_id, kalshi_id, ask, read_at) values ('old', 'KXE-1', null, $1), ('new', 'KXF-1', null, $2)",
      [new Date(RECHECK_EMPTY_BEFORE - 3_600_000), new Date(RECHECK_EMPTY_BEFORE + 60_000)]);
    const asked: string[] = [];
    const r = await kalshiAsksOnce(db, { candles: async (_s, t) => { asked.push(t); return { candlesticks: [candle(SEEN - 60_000, 0.4)] }; } }, NOW);
    expect(r).toMatchObject({ read: 1, priced: 1 });
    expect(asked).toEqual(["KXE-1"]);
    expect((await rows()).get("old")).toBe(0.4);
  });
});
