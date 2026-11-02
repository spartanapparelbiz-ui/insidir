/* Tonight's one-tap Reads (lib/read/tonight.ts) against a throwaway Postgres next to E2E_DATABASE_URL: the time shown is
 * the game's start, never a close time (Kalshi's expected expiration is hours after kickoff): a Kalshi-only game takes
 * its event milestone's start (stored by lib/markets/info.ts readInfos), a Kalshi game paired with Polymarket takes
 * Polymarket's start, a game with no known start shows no time; team names are full. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { readInfos } from "@/lib/markets/info";
import { tonightReads } from "@/lib/read/tonight";
import type { VMarket } from "@/lib/types";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_tonight_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const H = 3_600_000, DAY = 24 * H;
const NOW = Date.now(), KICK = NOW + 2 * H; // tonight's kickoff, two hours out

async function move(id: string, o: { source: "polymarket" | "kalshi"; market: string; title: string; amount: number; at: number; result?: "won" | "lost"; settled?: number; seen?: number }) {
  await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, at, last_at, tab, league, category, result, settled_at, seen_at, seen_price, trackers)
    values ($1, $2, $3, $4, $4, 'Yes', 'yes', $5, 0.5, $6, $6, 'sports', 'NFL', 'sports', $7, $8, $6, $9, array['nfl-big-money'])`,
    [id, o.source, o.market, o.title, o.amount, new Date(o.at), o.result ?? null, o.settled ? new Date(o.settled) : null, o.seen ?? null]);
}

describe.skipIf(!URL0)("tonight's one-tap Reads: start times and names, in Postgres", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    // The NFL tracker wins: 30 settled, 22 won at a 50¢ seen price. Its open positions tonight are proven money.
    for (let i = 0; i < 30; i++) await move(`h${i}`, { source: "polymarket", market: `0xold${i}`, title: "Old game", amount: 50_000, at: NOW - (40 - i) * DAY, result: i < 22 ? "won" : "lost", settled: NOW - (39 - i) * DAY, seen: 0.5 });
    // A: Kalshi only. B: Kalshi, paired with Polymarket 0xkcden. C: Kalshi only, no milestone.
    await move("a", { source: "kalshi", market: "KXNFLGAME-26NOV02LARSEA-LAR", title: "Los Angeles R at Seattle", amount: 300_000, at: NOW - H });
    await move("b", { source: "kalshi", market: "KXNFLGAME-26NOV02KCDEN-KC", title: "Kansas City at Denver", amount: 200_000, at: NOW - H });
    await move("c", { source: "kalshi", market: "KXNFLGAME-26NOV02NYGNYJ-NYG", title: "New York G at New York J", amount: 100_000, at: NOW - H });
    await pool.query(`insert into terminal.pairs (id, data, safety) values ('pb', $1, 'green')`, [JSON.stringify({ id: "pb", a: { venue: "polymarket", id: "0xkcden" }, b: { venue: "kalshi", id: "KXNFLGAME-26NOV02KCDEN-KC" }, inverted: false, method: "llm", confidence: 0.9, safety: "green", safetyNotes: [], blocked: false })]);
    await pool.query(`insert into terminal.market_info (source, market_id, start_at) values ('polymarket', '0xkcden', $1)`, [new Date(KICK - H)]);
    // The worker reads Kalshi: no start on the markets, expected expiration ~3 hours after kickoff; milestones for A only.
    const vm = (id: string, eventId: string): VMarket => ({ venue: "kalshi", id, eventId, seriesId: "KXNFLGAME", title: id, eventTitle: null, yesLabel: "Yes", noLabel: "No", rules: "",
      resolutionSource: null, closeTime: KICK + 3 * H, category: "sports", fee: { venue: "kalshi", multiplier: 1 }, url: "https://kalshi.com/markets/kxnflgame", yesTokenId: null, noTokenId: null, strike: null, active: true, result: null, volume24h: null, yesPrice: 0.5, startTime: null });
    const kalshi = {
      getMarketsById: async (ids: string[]) => new Map(ids.map(id => [id, vm(id, id.split("-").slice(0, 2).join("-"))])),
      getEventStart: async (e: string) => (e === "KXNFLGAME-26NOV02LARSEA" ? KICK : null),
    } as unknown as KalshiClient;
    await readInfos(db, { polymarket: {} as PolymarketClient, kalshi }, "kalshi", ["KXNFLGAME-26NOV02LARSEA-LAR", "KXNFLGAME-26NOV02KCDEN-KC", "KXNFLGAME-26NOV02NYGNYJ-NYG"], NOW);
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("shows the game's start, never Kalshi's close; full team names", async () => {
    const stored = await pool.query("select market_id, start_at, end_at from terminal.market_info where source = 'kalshi' order by market_id");
    expect(stored.rows.map(r => [r.market_id, r.start_at ? new Date(r.start_at).getTime() : null])).toEqual([
      ["KXNFLGAME-26NOV02KCDEN-KC", null], ["KXNFLGAME-26NOV02LARSEA-LAR", KICK], ["KXNFLGAME-26NOV02NYGNYJ-NYG", null]]);
    const rows = await tonightReads(db, NOW, 3);
    expect(rows.map(r => [r.venue, r.id, r.title, r.startAt])).toEqual([
      ["kalshi", "KXNFLGAME-26NOV02LARSEA-LAR", "Rams at Seahawks", KICK],          // the milestone's start, not KICK + 3h
      ["polymarket", "0xkcden", "Chiefs at Broncos", KICK - H],                     // Polymarket's start for the pair
      ["kalshi", "KXNFLGAME-26NOV02NYGNYJ-NYG", "Giants at Jets", null],            // no start known: no time shown
    ]);
  });
});
