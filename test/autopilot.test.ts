/* Autopilot (lib/autopilot): rules match moves, the finished Kalshi ticket, the too-late guard, caps, the backtest
 * without lookahead, the paper portfolio; then the engine end to end in Postgres: a proven wallet's buy on a twinned
 * market → one pushed ticket within the run, a skip when Kalshi moved, an exit ping, settlement. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { cleanSpec, DEFAULT_SPEC, describe as describeRule, leagueOf, mismatch, stakeLeft, ticketFor, tooLate, type Move, type RuleSpec } from "@/lib/autopilot/rules";
import { backtest, sameSideCounts, specKey, type BtRow } from "@/lib/autopilot/backtest";
import { exitPush, matchPush, runAutopilot, sentAfter, settleMatches, type Push, type Quote } from "@/lib/autopilot/engine";
import { paper, paperPnl } from "@/lib/autopilot/queries";
import { backtestLine, paperLine } from "@/lib/autopilot/text";
import { STARTERS } from "@/lib/autopilot/starters";
import { specFromForm } from "@/lib/autopilot/form";

const W = "0x" + "1".repeat(40), W2 = "0x" + "2".repeat(40), M = "0x" + "a".repeat(64);
const URL_NBA = "https://polymarket.com/event/nba-mia-lal-2026-11-04";
const move = (o: Partial<Move> = {}): Move => ({ id: "pm:1", wallet: W, kind: "open", marketId: M, side: "yes", outcome: "Heat", title: "Heat vs. Lakers", eventTitle: "Heat vs. Lakers",
  category: "basketball", url: URL_NBA, amount: 60_000, price: 0.61, at: 0, proven: true, settled: 40, sameSide: 1, ...o });
const spec = (o: Partial<{ [K in keyof RuleSpec]: Partial<RuleSpec[K]> }> = {}): RuleSpec => cleanSpec({
  wallets: { ...DEFAULT_SPEC.wallets, ...o.wallets }, markets: { ...DEFAULT_SPEC.markets, ...o.markets }, triggers: { ...DEFAULT_SPEC.triggers, ...o.triggers },
  price: { ...DEFAULT_SPEC.price, ...o.price }, stake: { ...DEFAULT_SPEC.stake, ...o.stake }, quiet: { ...DEFAULT_SPEC.quiet, ...o.quiet } });

describe("rules, pure", () => {
  it("cleans anything into a valid rule", () => {
    const s = cleanSpec({ wallets: { from: "followed", follow: ["0xABC", W.toUpperCase().replace("0X", "0x"), "nope"], minSettled: 3 }, markets: { categories: ["basketball", "nope"], leagues: ["nba", "xfl"] },
      triggers: { minBet: 1 }, price: { max: 5, maxMoveCents: -4 }, stake: { perBet: 50, daily: 10, weekly: 20 }, quiet: { start: "22:00", end: "7am" } });
    expect(s.wallets).toEqual({ from: "followed", follow: [W], minSettled: 30 });
    expect(s.markets.categories).toEqual(["basketball"]);
    expect(s.markets.leagues).toEqual(["nba"]);
    expect(s.triggers.minBet).toBe(5_000);
    expect(s.price).toEqual({ max: 0.99, maxMoveCents: 0 });
    expect(s.stake).toEqual({ perBet: 50, daily: 50, weekly: 50 });
    expect(s.quiet).toEqual({ start: "22:00", end: null });
    expect(leagueOf(URL_NBA)).toBe("nba");
    expect(leagueOf("https://polymarket.com/event/will-x-happen")).toBeNull();
  });
  it("matches wallets, markets and triggers; never a sell", () => {
    const s = spec();
    expect(mismatch(s, move())).toBeNull();
    expect(mismatch(s, move({ kind: "exit" }))).toBe("not a buy");
    expect(mismatch(s, move({ proven: false }))).toBe("wallet");
    expect(mismatch(s, move({ settled: 29 }))).toBe("record");
    expect(mismatch(spec({ wallets: { from: "followed", follow: [W2] } }), move())).toBe("wallet");
    expect(mismatch(spec({ wallets: { from: "followed", follow: [W] } }), move({ proven: false }))).toBeNull();
    expect(mismatch(spec({ markets: { categories: ["football"] } }), move())).toBe("category");
    expect(mismatch(spec({ markets: { leagues: ["nfl"] } }), move())).toBe("league");
    expect(mismatch(spec({ markets: { leagues: ["nba"] } }), move())).toBeNull();
    expect(mismatch(spec({ markets: { races: ["Texas Senate"] } }), move())).toBe("race");
    expect(mismatch(spec({ markets: { exclude: ["lakers"] } }), move())).toBe("excluded");
    expect(mismatch(spec({ triggers: { minBet: 100_000 } }), move())).toBe("size");
    expect(mismatch(spec({ triggers: { firstEntry: true } }), move({ kind: "add" }))).toBe("not first entry");
    expect(mismatch(spec({ triggers: { consensus: true } }), move())).toBe("no consensus");
    expect(mismatch(spec({ triggers: { consensus: true } }), move({ sameSide: 2 }))).toBeNull();
  });
  it("builds the ticket: limit = min(rule max, ask), whole contracts for the stake", () => {
    expect(ticketFor(spec({ stake: { perBet: 25 } }), 0.62)).toEqual({ limit: 0.62, contracts: 40, cost: 24.8 });
    expect(ticketFor(spec({ price: { max: 0.6 }, stake: { perBet: 25 } }), 0.62)).toEqual({ limit: 0.6, contracts: 41, cost: 24.6 });
    expect(ticketFor(spec(), 0.62, 0.5)).toBeNull();
  });
  it("too late: the exact skip line", () => {
    const s = spec({ price: { max: 0.85, maxMoveCents: 5 } });
    expect(tooLate(s, 0.61, 0.7)).toBe("Skipped: they paid 61¢, Kalshi is 70¢ now");
    expect(tooLate(s, 0.61, 0.66)).toBeNull();
    expect(tooLate(s, 0.85, 0.88)).toBe("Skipped: Kalshi is 88¢, over your 85¢ limit");
    expect(tooLate(s, 0.61, null)).toMatch(/no offer/);
    expect(stakeLeft(spec({ stake: { perBet: 25, daily: 60, weekly: 300 } }), 50, 100)).toBe(10);
  });
  it("says each rule in one line, and parses the form", () => {
    expect(describeRule(STARTERS[2]!.spec)).toBe("Proven wallets · bets of $25K+ · first entry · NBA, NFL, NHL · up to 80¢ · $25 a bet");
    const f = new FormData();
    for (const [k, v] of [["from", "proven"], ["minBet", "50000"], ["leagues", "nba"], ["leagues", "nhl"], ["consensus", "on"], ["maxCents", "70"], ["maxMoveCents", "3"], ["perBet", "40"], ["daily", "80"], ["weekly", "200"], ["races", "Lakers, Heat"]]) f.append(k!, v!);
    const s = specFromForm(f);
    expect(s.triggers).toEqual({ minBet: 50_000, firstEntry: false, consensus: true });
    expect(s.markets.leagues).toEqual(["nba", "nhl"]);
    expect(s.markets.races).toEqual(["Lakers", "Heat"]);
    expect(s.price).toEqual({ max: 0.7, maxMoveCents: 3 });
    expect(s.stake).toEqual({ perBet: 40, daily: 80, weekly: 200 });
  });
});

describe("backtest, pure", () => {
  const H = 3_600_000, NOW = Date.UTC(2026, 10, 4);
  const row = (o: Partial<BtRow>): BtRow => ({ id: "m", wallet: W, marketId: M, side: "yes", category: "basketball", url: URL_NBA, title: "Heat vs. Lakers", eventTitle: "Heat vs. Lakers", outcome: "Heat",
    amount: 60_000, theirPrice: 0.5, seenPrice: 0.5, at: NOW - 10 * 24 * H, result: "won", provenThen: true, settledThen: 40, firstEntry: true, ...o });
  it("counts agreement only from earlier bets, by wallets proven then", () => {
    const rows = [row({ id: "a", at: 0 }), row({ id: "b", wallet: W2, at: H / 2 }), row({ id: "c", wallet: "0x3", at: H / 2 + 1, provenThen: false }), row({ id: "d", wallet: W2, at: 3 * H })];
    expect(sameSideCounts(rows)).toEqual([1, 2, 2, 1]);
  });
  it("wins, losses, too late, caps; no wallet that wasn't proven yet; held to settlement", () => {
    const d = 24 * H, t0 = NOW - 20 * d;
    const rows = [
      row({ id: "win", at: t0, seenPrice: 0.49, theirPrice: 0.5 }),                // entry 50¢: 50 contracts, +$25
      row({ id: "loss", at: t0 + d, seenPrice: 0.39, theirPrice: 0.4, result: "lost" }), // entry 40¢: 62 contracts, −$24.80
      row({ id: "late", at: t0 + 2 * d, theirPrice: 0.4, seenPrice: 0.5 }),       // moved 10¢: too late
      row({ id: "notyet", at: t0 + 3 * d, provenThen: false }),                     // not proven then: left out
      row({ id: "open", at: t0 + 4 * d, result: null }),
      row({ id: "old", at: NOW - 200 * d }),                                         // outside 180 days
    ];
    const b = backtest(spec({ stake: { perBet: 25 } }), rows, NOW);
    expect(b).toMatchObject({ bets: 3, won: 1, lost: 1, open: 1, tooLate: 1, capped: 0 });
    expect(b.staked).toBeCloseTo(25 + 24.8);
    expect(b.net).toBeCloseTo(25 - 24.8);
    expect(b.maxDrawdown).toBeCloseTo(24.8);
    expect(b.curve.map(c => c[1])).toEqual([25, 0.2]);
    const capped = backtest(spec({ stake: { perBet: 25, daily: 25, weekly: 25 } }), rows, NOW);
    expect(capped.capped).toBeGreaterThan(0);
    expect(backtestLine(b)).toBe("Last 180 days (records start Oct 14): 3 bets: 1 won, 1 lost, 1 open. Net +$0.20 on $49.80 staked (+0%). Worst drop −$24.80.");
    expect(backtestLine(null)).toMatch(/running/);
    expect(specKey(spec())).toBe(specKey(spec({ quiet: { start: "22:00", end: "07:00" } })));
  });
});

describe("paper portfolio and pushes, pure", () => {
  it("buys at the ask + 1¢, sells at the bid on the wallet's exit, settles otherwise", () => {
    const base = { status: "sent" as const, stake: 24.8, paperEntry: 0.63, exitAt: null, exitPrice: null, result: null };
    expect(paperPnl(base)).toBeNull();
    expect(paperPnl({ ...base, result: "won" })).toBeCloseTo(39 - 39 * 0.63);
    expect(paperPnl({ ...base, result: "lost" })).toBeCloseTo(-39 * 0.63);
    expect(paperPnl({ ...base, exitAt: new Date(), exitPrice: 0.7, result: "lost" })).toBeCloseTo(39 * 0.07);
    const p = paper([{ ...base, result: "won" }, { ...base, result: "lost" }, base, { ...base, status: "skipped" }]);
    expect(p).toMatchObject({ matches: 3, won: 1, lost: 1, open: 1 });
    expect(paperLine(p)).toBe("Paper portfolio: 3 matches · 1 won, 1 lost · 1 open. Net −$10.14 on $49.14.");
    expect(sentAfter(6_200)).toBe("Sent 6s after the trade");
    expect(matchPush({ id: 7, ruleName: "Big bets", outcome: "Heat", side: "yes", contracts: 40, limit: 0.62, theirPrice: 0.61, amount: 60_000, latencyMs: 6_000 }, "https://insidir.com"))
      .toEqual({ title: "Autopilot · Big bets", url: "https://insidir.com/t/7", body: "Heat (Yes) on Kalshi: 40 at 62¢ limit. A proven wallet put $60K on it at 61¢. Sent 6s after the trade." });
    expect(exitPush({ id: 7, outcome: "Heat", kind: "exit", sold: 1, bid: 0.7 }, "https://insidir.com").body).toBe("The wallet behind your Heat match sold out. Kalshi's bid: 70¢.");
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_autopilot_${process.pid}`;

describe.skipIf(!URL0)("the engine in Postgres", () => {
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

  it("pushes the finished ticket once, skips when Kalshi moved, pings the exit, settles", async () => {
    const now = Date.now(), tradeAt = now - 6_000;
    await db.insert(schema.users).values({ id: "usr_a", email: "a@example.test", plan: "insidir", settings: schema.DEFAULT_SETTINGS });
    await db.insert(schema.watchlist).values([{ wallet: W, tier: "millionaire", pnl: 2_400_000, refreshedAt: new Date(now), settled: 40 }, { wallet: W2, tier: "millionaire", pnl: 1_800_000, refreshedAt: new Date(now), settled: 35 }]);
    await db.insert(schema.marketTwins).values({ polymarketId: M, kalshiId: "KXNBAGAME-26NOV04MIALAL-MIA", kalshiUrl: "https://kalshi.com/markets/kxnbagame/x", polymarketTitle: "Heat vs. Lakers",
      kalshiTitle: "Miami wins", kind: "winner", verdict: "candidate", status: "approved", confidence: 0.99, checks: { event: true, outcome: true, line: true, rules: true, close: true } });
    const [rule] = await db.insert(schema.autopilotRules).values({ userId: "usr_a", name: "Big bets", spec: spec({ triggers: { minBet: 50_000 }, stake: { perBet: 25 } }) }).returning();
    const ev = (o: Partial<typeof schema.positionEvents.$inferInsert>) => ({ id: "pm:1", wallet: W, tier: "millionaire" as const, marketId: M, outcomeSide: "yes" as const, outcome: "Heat", marketTitle: "Heat vs. Lakers",
      eventTitle: "Heat vs. Lakers", category: "basketball", url: URL_NBA, kind: "open" as const, amount: 60_000, price: 0.61, shares: 60_000 / 0.61, heldAfter: 60_000 / 0.61, at: new Date(tradeAt), lastAt: new Date(tradeAt), ...o });
    await db.insert(schema.positionEvents).values([ev({}), ev({ id: "pm:2", wallet: W2, price: 0.6, amount: 80_000, at: new Date(tradeAt - 1000), lastAt: new Date(tradeAt - 1000) })]);
    let q: Quote = { yesAsk: 0.62, noAsk: 0.4, yesBid: 0.6, noBid: 0.37 };
    const pushes: Array<[string, Push]> = [], claimed = new Set<string>();
    const deps = { appUrl: "https://insidir.com", quote: async () => q, push: async (u: string, m: Push) => { pushes.push([u, m]); },
      claim: async (u: string, k: string) => (claimed.has(`${u}|${k}`) ? false : (claimed.add(`${u}|${k}`), true)) };

    // W bought at 61¢, Kalshi 62¢: sent. W2 at 60¢, Kalshi 62¢: within 5¢, sent too.
    expect(await runAutopilot(db, now, deps)).toMatchObject({ sent: 2, skipped: 0 });
    const ms = await db.select().from(schema.autopilotMatches).orderBy(schema.autopilotMatches.eventId);
    expect(ms.map(m => [m.eventId, m.status, m.limitPrice, m.contracts, m.paperEntry, m.latencyMs])).toEqual([["pm:1", "sent", 0.62, 40, 0.63, 6_000], ["pm:2", "sent", 0.62, 40, 0.63, 7_000]]);
    const p1 = pushes.find(p => p[1].body.includes("$60K"))![1];
    expect(p1.body).toBe("Heat (Yes) on Kalshi: 40 at 62¢ limit. A proven wallet put $60K on it at 61¢. Sent 6s after the trade.");
    expect(p1.url).toBe(`https://insidir.com/t/${ms[0]!.id}`);
    // Run again: nothing twice.
    expect(await runAutopilot(db, now + 3_000, deps)).toMatchObject({ sent: 0, skipped: 0 });

    // A third proven wallet buys, but Kalshi has run to 70¢: skipped, logged, not pushed.
    await db.insert(schema.watchlist).values({ wallet: "0x" + "3".repeat(40), tier: "millionaire", pnl: 1_200_000, refreshedAt: new Date(now), settled: 31 });
    await db.insert(schema.positionEvents).values(ev({ id: "pm:3", wallet: "0x" + "3".repeat(40) }));
    q = { ...q, yesAsk: 0.7 };
    const n = pushes.length;
    expect(await runAutopilot(db, now + 4_000, deps)).toMatchObject({ sent: 0, skipped: 1 });
    expect(pushes.length).toBe(n);
    expect((await db.select().from(schema.autopilotMatches).where(sql`event_id = 'pm:3'`))[0]!.reason).toBe("Skipped: they paid 61¢, Kalshi is 70¢ now");

    // W sells out: "They're getting out", once, and the paper position closes at Kalshi's bid.
    await db.insert(schema.positionEvents).values(ev({ id: "ps:1", kind: "exit", amount: 70_000, price: 0.7, shares: 60_000 / 0.61, heldAfter: 0, at: new Date(now + 5_000), lastAt: new Date(now + 5_000) }));
    q = { ...q, yesBid: 0.68 };
    expect(await runAutopilot(db, now + 6_000, deps)).toMatchObject({ exits: 1 });
    expect(pushes.at(-1)![1]).toMatchObject({ title: "They're getting out" });
    expect(await runAutopilot(db, now + 9_000, deps)).toMatchObject({ exits: 0 });
    const m1 = (await db.select().from(schema.autopilotMatches).where(sql`event_id = 'pm:1'`))[0]!;
    expect([m1.exitEventId, m1.exitPrice]).toEqual(["ps:1", 0.68]);

    // W2's bet settles: its match settles with it.
    await db.insert(schema.millionaireBets).values({ id: "pm:2", wallet: W2, tier: "millionaire", source: "polymarket", marketId: M, eventTitle: "Heat vs. Lakers", marketTitle: "Heat vs. Lakers",
      outcome: "Heat", outcomeSide: "yes", amount: 80_000, price: 0.6, category: "basketball", at: new Date(tradeAt), lastAt: new Date(tradeAt), result: "won", settledAt: new Date(now) });
    expect(await settleMatches(db)).toBe(1);
    expect(rule!.id).toBeGreaterThan(0);
  });
});
