/* Positions (lib/millionaires/positions.ts): a watched wallet's buys open or add, its sells trim or exit, against what
 * we've seen it hold; pings say which, with Kalshi's price; the Kalshi record settles with the bet. Pure parts first,
 * then the database, against a throwaway database next to E2E_DATABASE_URL. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { classify, EXIT_SHARE, recordPositions, sellRuns, soldShare } from "@/lib/millionaires/positions";
import { pingMessage, type PingBet } from "@/lib/millionaires/pings";
import { freshBigBets, freshBigSells, recordKalshiPings } from "@/lib/millionaires/ping-store";
import { kalshiPingRecord } from "@/lib/results/pings";
import type { Fill } from "@/lib/moves/types";

const W = "0xabc0000000000000000000000000000000000001", M = "0x" + "a".repeat(64), MIN = 60_000;
const fill = (o: Partial<Fill> & { at: number; contracts: number; price: number }): Fill => ({ source: "polymarket", id: `f${o.at}`, marketId: M, eventTitle: "Heat vs. Lakers", marketTitle: "Heat vs. Lakers",
  outcome: "Lakers", outcomeSide: "no", side: "SELL", wallet: W, walletName: null, url: "https://polymarket.com/event/nba-mia-lal-2026-11-04/nba-mia-lal-2026-11-04", ...o });

describe("positions, pure", () => {
  it("merges a wallet's SELL fills into runs ($5K+), never its buys or anyone unwatched", () => {
    const fills = [fill({ at: 0, contracts: 10_000, price: 0.5 }), fill({ at: 5 * MIN, contracts: 6_000, price: 0.6 }), fill({ at: 40 * MIN, contracts: 2_000, price: 0.5 }),
      fill({ at: 1, contracts: 50_000, price: 0.5, side: "BUY" }), fill({ at: 2, contracts: 50_000, price: 0.5, wallet: "0xother" })];
    const runs = sellRuns(fills, w => w === W);
    expect(runs).toHaveLength(1); // the $1K run 40 minutes later is under $5K
    expect(runs[0]).toMatchObject({ wallet: W, shares: 16_000, amount: 8_600, at: 0, lastAt: 5 * MIN });
    expect(runs[0]!.price).toBeCloseTo(8_600 / 16_000);
  });
  it("buys open or add; sells trim, or exit at 90%+; a sell of a position never seen is left out", () => {
    expect(classify(0, { side: "buy", shares: 100 })).toEqual({ kind: "open", heldAfter: 100 });
    expect(classify(100, { side: "buy", shares: 50 })).toEqual({ kind: "add", heldAfter: 150 });
    expect(classify(150, { side: "sell", shares: 60 })).toEqual({ kind: "trim", heldAfter: 90 });
    expect(classify(90, { side: "sell", shares: 90 * EXIT_SHARE })?.kind).toBe("exit");
    expect(classify(0, { side: "sell", shares: 10 })).toBeNull();
    expect(soldShare(60, 90)).toBeCloseTo(0.4);
  });
  it("pings say what the wallet did, with Kalshi's price for that side", () => {
    const base: PingBet = { id: "pm:x", marketId: M, side: "no", tier: "millionaire", amount: 40_000, category: "basketball", title: "Heat vs. Lakers", outcome: "Lakers", price: 0.55, pnl: 2_400_000 };
    // A NO costs Kalshi's NO ask (53¢), not 1 − the YES ask (1 − 0.49 = 51¢, the best NO bid).
    const twin = { yes: 0.49, noAsk: 0.53 };
    expect(pingMessage({ ...base, kind: "add" }, null, "https://insidir.com", twin).body).toBe("A +$2.4M wallet added $40K to Lakers at 55¢ on Polymarket. Kalshi: 53¢.");
    const trim = pingMessage({ ...base, kind: "trim", sold: 0.4, path: "/market/heat-vs-lakers-aaaaaa" }, null, "https://insidir.com", twin);
    expect(trim.body).toBe("A +$2.4M wallet sold $40K of Lakers (about 40% of it) at 55¢ on Polymarket. Kalshi: 53¢.");
    expect(trim.url).toBe("https://insidir.com/market/heat-vs-lakers-aaaaaa");
    expect(pingMessage({ ...base, kind: "exit", path: "/m" }, null, "https://insidir.com", twin).body).toBe("A +$2.4M wallet sold out of Lakers at 55¢ on Polymarket. Kalshi: 53¢.");
    expect(pingMessage({ ...base }, null, "https://insidir.com", twin).body).toBe("A +$2.4M wallet bought Lakers at 55¢ on Polymarket. Kalshi: 53¢.");
    // No NO offer on Kalshi: no Kalshi price, rather than a wrong one. A YES bet uses the YES price.
    expect(pingMessage({ ...base }, null, "https://insidir.com", { yes: 0.49 }).body).toBe("A +$2.4M wallet bought Lakers at 55¢ on Polymarket.");
    expect(pingMessage({ ...base, side: "yes" }, null, "https://insidir.com", twin).body).toBe("A +$2.4M wallet bought Lakers at 55¢ on Polymarket. Kalshi: 49¢.");
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_positions_${process.pid}`;

describe.skipIf(!URL0)("positions in Postgres: open, add, trim, exit; the pings; the Kalshi record", () => {
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

  it("records each move against what the wallet held, pings the sells on twinned markets and keeps the Kalshi record", async () => {
    const now = Date.now(), t0 = now - 8 * MIN;
    const bet = (id: string, at: number, amount: number, price: number) => ({ id, wallet: W, tier: "millionaire" as const, source: "polymarket" as const, marketId: M, eventTitle: "Heat vs. Lakers", marketTitle: "Heat vs. Lakers",
      outcome: "Lakers", outcomeSide: "no" as const, amount, price, category: "basketball", url: null, yesLabel: "Heat", noLabel: "Lakers", at: new Date(at), lastAt: new Date(at) });
    const b1 = bet("pm:1", t0, 50_000, 0.5), b2 = bet("pm:2", t0 + MIN, 30_000, 0.6);
    await db.insert(schema.millionaireBets).values([b1, b2]);
    await db.insert(schema.watchlist).values({ wallet: W, tier: "millionaire", pnl: 2_400_000, refreshedAt: new Date(now) });
    const tier = () => "millionaire" as const;
    // A sale of a market it never bought in: not recorded.
    expect(await recordPositions(db, [], sellRuns([fill({ at: t0 - MIN, contracts: 20_000, price: 0.5, marketId: "0x" + "b".repeat(64) })], () => true), tier)).toBe(0);
    await recordPositions(db, [b1, b2], [], tier);
    // 100,000 + 50,000 shares held; sell 60,000 (a trim), then the other 90,000 (an exit).
    await recordPositions(db, [], sellRuns([fill({ at: t0 + 2 * MIN, contracts: 60_000, price: 0.55 })], () => true), tier);
    await recordPositions(db, [], sellRuns([fill({ at: t0 + 6 * MIN, contracts: 90_000, price: 0.6 })], () => true), tier);
    const evs = await db.select().from(schema.positionEvents).orderBy(schema.positionEvents.at);
    expect(evs.map(e => [e.kind, Math.round(e.heldAfter)])).toEqual([["open", 100_000], ["add", 150_000], ["trim", 90_000], ["exit", 0]]);

    // Pings: the add reads as one; sells only once the market has an approved Kalshi twin.
    const buys = await freshBigBets(db, now);
    expect(buys.map(b => [b.id, b.kind])).toEqual([["pm:2", "add"], ["pm:1", "open"]]);
    expect(await freshBigSells(db, now)).toEqual([]);
    await db.insert(schema.marketTwins).values({ polymarketId: M, kalshiId: "KXNBAGAME-26NOV04MIALAL-LAL", kalshiUrl: "https://kalshi.com/markets/kxnbagame", polymarketTitle: "Heat vs. Lakers",
      kalshiTitle: "Los Angeles L wins", kind: "winner", verdict: "candidate", status: "approved", confidence: 0.99, checks: { event: true, outcome: true, line: true, rules: true, close: true } });
    const sells = await freshBigSells(db, now);
    expect(sells.map(s => s.kind)).toEqual(["exit", "trim"]);
    expect(sells[1]!.sold).toBeCloseTo(0.4);

    // The Kalshi record: both buys at Kalshi's price for the No side (the Lakers), once each; settled with the bets.
    const twins = new Map([[M, { kalshiId: "KXNBAGAME-26NOV04MIALAL-LAL", yes: 0.43, noAsk: 0.55 }]]);
    expect(await recordKalshiPings(db, [...buys, ...sells], twins, now)).toBe(2);
    expect(await recordKalshiPings(db, buys, twins, now)).toBe(0);
    await db.update(schema.millionaireBets).set({ result: "won", settledAt: new Date(now) });
    const rec = await kalshiPingRecord(db, now + 1000);
    expect(rec.pinged).toBe(2);
    expect(rec.total).toMatchObject({ won: 2, lost: 0, staked: 200 });
    expect(rec.total.back).toBeCloseTo(2 * 100 / 0.55);
    expect(rec.net).toBeNull(); // under 30 settled pings
  });
});
