/* The Read against a throwaway Postgres next to E2E_DATABASE_URL, with venues that don't answer (so everything comes
 * from what we hold): a Polymarket market matched to an inverted Kalshi one; a proven wallet (30+ settled, positive
 * followable return) and an unproven one; big bets on both venues, Kalshi's turned to Polymarket's sides, a fresh
 * wallet flagged; prices from both venues; typed words resolved to one market or 3 choices; the 60-second cache; the
 * per-member AI cap; one free Read per visitor. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { buildRead, type Clients } from "@/lib/read/build";
import { resolveText } from "@/lib/read/resolve";
import { cancelReasonCounts, duration, postFunnel, readTimings, retention } from "@/lib/read/admin";
import { refreshWatched, tonightFor, weeklyRecap, yourMarkets } from "@/lib/read/member";
import { addAiSpend, aiSpent, cachedRead, getRead, lineFor, readsUsed, saveRead, setLine } from "@/lib/read/store";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_read_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const H = 3_600_000, NOW = Date.UTC(2026, 10, 1, 18);
const PROVEN = "0xaaaa" + "1".repeat(34) + "aa", NOBODY = "0xbbbb" + "2".repeat(34) + "bb", FRESH = "0xcccc" + "3".repeat(34) + "cc";
const dead = () => Promise.reject(new Error("offline"));
const clients = { polymarket: { getMarketsById: dead, getEventBySlug: dead, searchEvents: dead }, kalshi: { getMarketsById: dead } } as unknown as Clients;

async function move(id: string, o: { source?: "polymarket" | "kalshi"; market: string; side: "yes" | "no"; amount: number; price: number; at: number; wallet?: string | null; result?: "won" | "lost" | null; settled?: number; seen?: number; fresh?: boolean; title?: string }) {
  await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, category, result, settled_at, seen_at, seen_price, new_wallet, url)
    values ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $10, 'sports', 'sports', $11, $12, $10, $13, $14, $15)`,
    [id, o.source ?? "polymarket", o.market, o.title ?? "Chiefs vs. Bills", o.side === "yes" ? "Chiefs" : "Bills", o.side, o.amount, o.price, o.wallet === undefined ? null : o.wallet, new Date(o.at),
      o.result ?? null, o.settled ? new Date(o.settled) : null, o.seen ?? null, o.fresh ?? null, o.source === "kalshi" ? "https://kalshi.com/markets/kxnfl/kc" : "https://polymarket.com/event/chiefs-bills"]);
}

describe.skipIf(!URL0)("The Read, in Postgres", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    // PROVEN: 32 settled, 22 won at a 49¢ seen price → positive followable return. NOBODY: 32 settled, 5 won → negative.
    for (let i = 0; i < 32; i++) {
      await move(`p${i}`, { market: `0xold${i}`, side: "yes", amount: 20_000, price: 0.48, at: NOW - (200 - i) * H, wallet: PROVEN, result: i < 22 ? "won" : "lost", settled: NOW - (190 - i) * H, seen: 0.49 });
      await move(`n${i}`, { market: `0xold${i}`, side: "yes", amount: 20_000, price: 0.48, at: NOW - (200 - i) * H, wallet: NOBODY, result: i < 5 ? "won" : "lost", settled: NOW - (190 - i) * H, seen: 0.49 });
    }
    // The market now: PROVEN $60K on Chiefs (open); NOBODY $90K on Bills; a fresh wallet's $30K long shot; a Kalshi YES
    // (which pays like Polymarket's NO: the pair is inverted) $45K.
    await move("m1", { market: "0xkcbuf", side: "yes", amount: 60_000, price: 0.6, at: NOW - 2 * H, wallet: PROVEN });
    await move("m2", { market: "0xkcbuf", side: "no", amount: 90_000, price: 0.4, at: NOW - 3 * H, wallet: NOBODY });
    await move("m3", { market: "0xkcbuf", side: "no", amount: 30_000, price: 0.12, at: NOW - 4 * H, wallet: FRESH, fresh: true });
    await move("m4", { source: "kalshi", market: "KXNFL-KCBUF", side: "yes", amount: 45_000, price: 0.41, at: NOW - 5 * H });
    await move("m5", { market: "0xkcbuf", side: "yes", amount: 99_000, price: 0.55, at: NOW - 30 * H, wallet: PROVEN }); // older than 24h
    await pool.query(`insert into terminal.markets (venue, id, data) values ('polymarket', '0xkcbuf', $1), ('kalshi', 'KXNFL-KCBUF', $2), ('polymarket', '0xsen1', $3), ('polymarket', '0xsen2', $4)`, [
      JSON.stringify({ venue: "polymarket", id: "0xkcbuf", title: "Chiefs vs. Bills", eventTitle: "NFL: Chiefs vs. Bills", yesLabel: "Chiefs", noLabel: "Bills", url: "https://polymarket.com/event/chiefs-bills", yesPrice: 0.62, volume24h: 140_000, active: true, result: null, closeTime: NOW + 30 * H }),
      JSON.stringify({ venue: "kalshi", id: "KXNFL-KCBUF", title: "Will Buffalo beat Kansas City?", eventTitle: null, yesLabel: "Bills", noLabel: "Chiefs", url: "https://kalshi.com/markets/kxnfl/kc", yesPrice: 0.4, volume24h: null, active: true, result: null, closeTime: NOW + 30 * H }),
      JSON.stringify({ venue: "polymarket", id: "0xsen1", title: "Which party wins Senate control in 2026?", eventTitle: "Senate control", yesLabel: "Republicans", noLabel: "Democrats", url: "https://polymarket.com/event/senate", yesPrice: 0.7, volume24h: 900_000, active: true, result: null, closeTime: NOW + 400 * 24 * H }),
      JSON.stringify({ venue: "polymarket", id: "0xsen2", title: "Senate control after the 2026 midterms: Democrats?", eventTitle: "Senate control", yesLabel: "Yes", noLabel: "No", url: "https://polymarket.com/event/senate-d", yesPrice: 0.3, volume24h: 200_000, active: true, result: null, closeTime: NOW + 400 * 24 * H }),
    ]);
    await pool.query(`insert into terminal.pairs (id, data, safety) values ('pkc', $1, 'green')`, [JSON.stringify({ id: "pkc", a: { venue: "polymarket", id: "0xkcbuf" }, b: { venue: "kalshi", id: "KXNFL-KCBUF" }, inverted: true, method: "llm", confidence: 0.9, safety: "green", safetyNotes: [], blocked: false })]);
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("builds from either listing: proven money from proven wallets only, the last 24 hours of big bets, prices from both venues", async () => {
    const r = await buildRead(db, clients, "kalshi", "KXNFL-KCBUF", NOW);
    expect(r.key).toBe("p:0xkcbuf");
    expect(r).toMatchObject({ question: "Chiefs vs. Bills", yesLabel: "Chiefs", noLabel: "Bills" });
    expect(r.kalshi).toMatchObject({ id: "KXNFL-KCBUF", inverted: true, url: "https://kalshi.com/markets/kxnfl/kc" });
    // PROVEN's open Chiefs money (m1 + m5: still open) only; NOBODY's Bills money doesn't count.
    expect(r.proven).toEqual({ yes: { dollars: 159_000, wallets: 1 }, no: { dollars: 0, wallets: 0 }, wallets: 1, yesShare: 1 });
    expect(r.bets.map(b => [b.venue, b.side, b.amount])).toEqual([["polymarket", "no", 90_000], ["polymarket", "yes", 60_000], ["kalshi", "no", 45_000], ["polymarket", "no", 30_000]]);
    const fresh = r.bets.find(b => b.amount === 30_000)!;
    // $30K of a $140K day is big for this market too.
    expect(fresh.unusual).toEqual(["fresh_wallet", "big_for_market", "long_shot"]);
    expect(fresh.ofVolume).toBeCloseTo(30 / 140, 9);
    expect(fresh.wallet).toBe("0xcc…cc");
    expect(r.bets.find(b => b.amount === 90_000)!.unusual).toEqual(["big_for_market"]);
    expect(r.bets.find(b => b.venue === "kalshi")!.wallet).toBeNull();
    // Kalshi's YES (Bills) at 40¢ is Chiefs at 60¢: cheaper than Polymarket's 62¢.
    expect(r.prices.yes.polymarket).toBeCloseTo(0.62, 9);
    expect(r.prices.yes.kalshi).toBeCloseTo(0.6, 9);
    expect(r.prices.yes.best).toBe("kalshi");
    expect(r.prices.no.best).toBe("polymarket");
  });

  it("resolves typed words: one clear market, or up to 3 choices; a pasted Kalshi link; nothing found", async () => {
    expect(await resolveText(db, clients, "Chiefs Bills", NOW)).toEqual({ kind: "market", venue: "polymarket", id: "0xkcbuf" });
    const s = await resolveText(db, clients, "Senate control", NOW);
    expect(s.kind).toBe("choices");
    expect(s.kind === "choices" && s.list.map(c => c.id).sort()).toEqual(["0xsen1", "0xsen2"]);
    expect(await resolveText(db, clients, "https://kalshi.com/markets/kxnfl/nfl-game/KXNFL-KCBUF", NOW)).toEqual({ kind: "market", venue: "kalshi", id: "KXNFL-KCBUF" });
    expect(await resolveText(db, clients, "https://polymarket.com/event/chiefs-bills", NOW)).toEqual({ kind: "market", venue: "polymarket", id: "0xkcbuf" });
    expect((await resolveText(db, clients, "curling world cup", NOW)).kind).toBe("none");
    expect((await resolveText(db, clients, "NVDA", NOW)).kind).toBe("none");
  });

  it("caches a market for a minute; the line is written for members within a daily AI cap; one free Read per visitor", async () => {
    const a = await cachedRead(db, clients, "polymarket", "0xkcbuf", NOW);
    const b = await cachedRead(db, clients, "polymarket", "0xkcbuf", NOW + 1000);
    expect(b).toBe(a);
    await addAiSpend(db, "usr_capped", 5, NOW);
    expect(await aiSpent(db, "usr_capped", NOW)).toBe(5);
    const line = await lineFor(db, a, "usr_capped", NOW);
    expect(line).toMatchObject({ origin: "template", model: "template-capped" });
    expect(line.text).toMatch(/^100% of proven money is on Chiefs; the largest is \$90K on Bills at 40¢\.$/);
    expect(await readsUsed(db, { userId: null, visitorId: "v1" })).toBe(0);
    const id = await saveRead(db, { userId: null, visitorId: "v1", input: "text", data: { ...a, line: null }, ms: 120 }, NOW);
    expect(await readsUsed(db, { userId: null, visitorId: "v1" })).toBe(1);
    await setLine(db, id, { text: line.text, origin: "template", model: line.model });
    expect((await getRead(db, id))!.data.line?.text).toBe(line.text);
  });

  it("/admin: landing → first Read and → paid (by the paying account's visitor), Reads' build time, cancel reasons", async () => {
    const at = (min: number) => new Date(NOW - min * 60_000);
    await pool.query(`insert into terminal.events (name, visitor_id, user_id, at) values
      ('landing_view', 'va', null, $1), ('read', 'va', null, $2), ('read', 'va', null, $3),
      ('landing_view', 'vb', null, $4), ('read', 'vb', null, $5),
      ('landing_view', 'vc', null, $6), ('paid', 'server', 'usr_paid', $7)`, [at(60), at(59), at(10), at(30), at(26), at(120), at(90)]);
    await pool.query(`insert into terminal.users (id, email, plan, visitor_id) values ('usr_paid', 'paid@example.test', 'insidir', 'vc')`);
    await pool.query(`insert into terminal.cancel_reasons (user_id, reason) values ('usr_paid', 'price'), ('usr_x', 'price'), ('usr_y', 'unused')`);
    const t = await readTimings(db, new Date(NOW - 7 * 86_400_000));
    // va: 1 minute to the first Read; vb: 4 minutes. Median 150 s.
    expect(t.toRead).toMatchObject({ n: 2, medianS: 150 });
    expect(t.toPaid).toMatchObject({ n: 1, medianS: 1800 });
    expect(t.reads.n).toBe(1);
    expect(duration(150)).toBe("2m 30s");
    expect(duration(1800)).toBe("30m 0s");
    expect(await cancelReasonCounts(db, new Date(NOW - 90 * 86_400_000))).toEqual([{ reason: "price", n: 2 }, { reason: "unused", n: 1 }]);
  });

  it("member home: tonight in their leagues, Your markets marked when proven money moved, and the week's record", async () => {
    // An NFL game tonight with big money (tagged as the worker tags it), and one tomorrow evening (not tonight).
    await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, at, last_at, tab, league, category, trackers)
      values ('nfl1', 'polymarket', '0xnfltonight', 'Jets vs. Dolphins', 'Jets vs. Dolphins', 'Jets', 'yes', 80000, 0.45, $1, $1, 'sports', 'NFL', 'sports', array['nfl-big-money']),
             ('nfl2', 'polymarket', '0xnfllater', 'Rams vs. 49ers', 'Rams vs. 49ers', 'Rams', 'yes', 90000, 0.5, $1, $1, 'sports', 'NFL', 'sports', array['nfl-big-money'])`, [new Date(NOW - H)]);
    await pool.query(`insert into terminal.market_info (source, market_id, yes_price, start_at) values ('polymarket', '0xnfltonight', 0.46, $1), ('polymarket', '0xnfllater', 0.5, $2)`,
      [new Date(NOW + 3 * H), new Date(NOW + 50 * H)]);
    const t = await tonightFor(db, ["nfl", "nba"], NOW);
    expect(t.map(x => [x.label, x.marketId, x.total])).toEqual([["NFL", "0xnfltonight", 80_000]]);
    expect(await tonightFor(db, [], NOW)).toEqual([]);

    // usr_m read Chiefs vs. Bills; a refresh later shows proven money moved.
    const base = await buildRead(db, clients, "polymarket", "0xkcbuf", NOW);
    await saveRead(db, { userId: "usr_m", visitorId: null, input: "text", data: { ...base, line: null }, ms: 100 }, NOW);
    let mine = await yourMarkets(db, "usr_m", NOW + 60_000);
    expect(mine.map(m => [m.key, m.moved])).toEqual([["p:0xkcbuf", null]]);
    // Bills money from a proven wallet arrives; the worker's refresh reads it.
    await move("m6", { market: "0xkcbuf", side: "no", amount: 100_000, price: 0.4, at: NOW + 10 * 60_000, wallet: PROVEN });
    expect(await refreshWatched(db, clients, NOW + 20 * 60_000)).toBe(1);
    mine = await yourMarkets(db, "usr_m", NOW + 30 * 60_000);
    expect(mine[0]!.latest.input).toBe("refresh");
    expect(mine[0]!.moved).toEqual({ from: 1, to: 159_000 / 259_000 });
    // Seen now: no mark on the next visit.
    expect((await yourMarkets(db, "usr_m", NOW + 40 * 60_000))[0]!.moved).toBeNull();

    // The week: Chiefs vs. Bills settles, Chiefs win: proven money was on Chiefs in usr_m's own last Read → right.
    expect(await weeklyRecap(db, "usr_m", NOW + 60 * 60_000)).toEqual({ right: 0, of: 0, lines: [] });
    await pool.query(`update terminal.moves set result = case when outcome_side = 'yes' then 'won' else 'lost' end, settled_at = $1 where market_id = '0xkcbuf'`, [new Date(NOW + 2 * H)]);
    const w = await weeklyRecap(db, "usr_m", NOW + 3 * H);
    expect(w).toEqual({ right: 1, of: 1, lines: [{ key: "p:0xkcbuf", question: "Chiefs vs. Bills", provenSide: "Chiefs", won: "Chiefs", right: true }] });
    // Had Bills won, it would count as wrong: losses included.
    await pool.query(`update terminal.moves set result = case when outcome_side = 'yes' then 'lost' else 'won' end where market_id = '0xkcbuf'`);
    expect((await weeklyRecap(db, "usr_m", NOW + 3 * H)).right).toBe(0);
  });

  it("/admin per post (visits → Reads → paid by first-touch UTM), paid on day 8, 30-day churn", async () => {
    const D = 86_400_000, at = (ms: number) => new Date(NOW - ms);
    await pool.query(`insert into terminal.events (name, visitor_id, user_id, props, at) values
      ('landing_view', 'p1', null, '{"utm_source":"ig","utm_content":"reel-42"}', $1), ('read', 'p1', null, null, $2),
      ('landing_view', 'p2', null, '{"utm_source":"ig","utm_content":"reel-42"}', $1), ('read', 'p2', null, null, $2),
      ('landing_view', 'p3', null, '{"utm_source":"ig","utm_content":"reel-42"}', $1),
      ('landing_view', 'p4', null, '{"utm_source":"tt","utm_campaign":"launch"}', $1),
      ('landing_view', 'p1', null, '{"utm_source":"x","utm_content":"later"}', $2),
      ('landing_view', 'monitor-abc', null, '{"utm_source":"ig","utm_content":"reel-42"}', $1),
      ('paid', 'server', 'u_p1', null, $2)`, [at(3 * 60_000), at(2 * 60_000)]);
    await pool.query(`insert into terminal.users (id, email, plan, visitor_id) values ('u_p1', 'p1@example.test', 'insidir', 'p1')`);
    const posts = await postFunnel(db, new Date(NOW - 7 * D));
    expect(posts.find(p => p.post === "reel-42")).toEqual({ post: "reel-42", source: "ig", visits: 3, reads: 2, paid: 1 });
    expect(posts.find(p => p.post === "launch")).toEqual({ post: "launch", source: "tt", visits: 1, reads: 0, paid: 0 });
    expect(posts.find(p => p.post === "later")).toBeUndefined();

    // Day 8: d1 started 20 days ago and was charged again 7 days later; d2 started 15 days ago, never again; d3 started
    // 3 days ago (too soon to count). Churn: c1 and c2 paid 45 days ago; c2 is set to cancel.
    await pool.query(`insert into terminal.users (id, email, plan, cancel_at_period_end) values ('d1', 'd1@x.test', 'insidir', false), ('d2', 'd2@x.test', 'free', false),
      ('d3', 'd3@x.test', 'insidir', false), ('c1', 'c1@x.test', 'insidir', false), ('c2', 'c2@x.test', 'insidir', true)`);
    await pool.query(`insert into terminal.events (name, visitor_id, user_id, at) values ('paid', 'server', 'd1', $1), ('paid', 'server', 'd1', $2), ('paid', 'server', 'd2', $3),
      ('paid', 'server', 'd3', $4), ('paid', 'server', 'c1', $5), ('paid', 'server', 'c2', $5)`, [at(20 * D), at(13 * D), at(15 * D), at(3 * D), at(45 * D)]);
    const k = await retention(db, NOW);
    expect(k.day8).toEqual({ started: 2, paid: 1 });
    expect(k.churn30).toMatchObject({ churned: 1 });
    expect(k.churn30.active).toBeGreaterThanOrEqual(2);
  });
});