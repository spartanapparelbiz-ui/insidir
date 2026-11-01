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
import { readFacts, readHasMoney, templateLine } from "@/lib/read/math";
import type { PolymarketClient } from "@/lib/exchanges";
import { PROVEN_RECORD_TTL_MS, provenBackfillOnce, RECORD_MAX_PAGES } from "@/lib/moves/jobs";
import { recordsFor, walletPnlFor, walletsToBackfill } from "@/lib/moves/store";
import { resolveText } from "@/lib/read/resolve";
import { cancelReasonCounts, duration, postFunnel, readTimings, retention } from "@/lib/read/admin";
import { refreshWatched, tonightFor, weeklyRecap, yourMarkets } from "@/lib/read/member";
import { addAiSpend, aiSpent, cachedRead, getRead, lineFor, READ_OFFER_MS, readsUsed, saveOffer, saveRead, setLine, wasOffered } from "@/lib/read/store";
import { tonightReads } from "@/lib/read/tonight";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_read_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const H = 3_600_000, NOW = Date.UTC(2026, 10, 1, 18);
const PROVEN = "0xaaaa" + "1".repeat(34) + "aa", NOBODY = "0xbbbb" + "2".repeat(34) + "bb", FRESH = "0xcccc" + "3".repeat(34) + "cc", RECORDW = "0xdddd" + "4".repeat(34) + "dd";
const dead = () => Promise.reject(new Error("offline"));
const clients = { polymarket: { getMarketsById: dead, getEventBySlug: dead, searchEvents: dead }, kalshi: { getMarketsById: dead } } as unknown as Clients;

async function move(id: string, o: { source?: "polymarket" | "kalshi"; market: string; side: "yes" | "no"; amount: number; price: number; at: number; wallet?: string | null; result?: "won" | "lost" | null; settled?: number; seen?: number; fresh?: boolean; title?: string; trackers?: string[]; outcome?: string; url?: string }) {
  await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, category, result, settled_at, seen_at, seen_price, new_wallet, url, trackers)
    values ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $10, 'sports', 'sports', $11, $12, $10, $13, $14, $15, $16)`,
    [id, o.source ?? "polymarket", o.market, o.title ?? "Chiefs vs. Bills", o.outcome ?? (o.side === "yes" ? "Chiefs" : "Bills"), o.side, o.amount, o.price, o.wallet === undefined ? null : o.wallet, new Date(o.at),
      o.result ?? null, o.settled ? new Date(o.settled) : null, o.seen ?? null, o.fresh ?? null, o.url ?? (o.source === "kalshi" ? "https://kalshi.com/markets/kxnfl/kc" : "https://polymarket.com/event/chiefs-bills"), o.trackers ?? []]);
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
    // The same positions make Long Shots a winning tracker (+37.5% over 32) and Heavy Favorites a losing one.
    for (let i = 0; i < 32; i++) {
      await move(`p${i}`, { market: `0xold${i}`, side: "yes", amount: 20_000, price: 0.48, at: NOW - (200 - i) * H, wallet: PROVEN, result: i < 22 ? "won" : "lost", settled: NOW - (190 - i) * H, seen: 0.49, trackers: ["underdog-hunters"] });
      await move(`n${i}`, { market: `0xold${i}`, side: "yes", amount: 20_000, price: 0.48, at: NOW - (200 - i) * H, wallet: NOBODY, result: i < 5 ? "won" : "lost", settled: NOW - (190 - i) * H, seen: 0.49, trackers: ["favorites-only"] });
    }
    // Public Polymarket records (terminal.wallet_pnl: /closed-positions count, /v1/leaderboard pnl): RECORDW is proven (41 closed, +$52,340);
    // NOBODY has 50 closed and lost money.
    await pool.query(`insert into terminal.wallet_pnl (wallet, closed, closed_at_least, pnl, read_at) values
      ($1, 41, false, 52340, $3), ($2, 50, false, -1000, $3)`, [RECORDW, NOBODY, new Date(NOW - H)]);
    // The market now: PROVEN $60K on Chiefs (open); NOBODY $90K on Bills; a fresh wallet's $30K long shot; a Kalshi YES
    // (which pays like Polymarket's NO: the pair is inverted) $45K.
    await move("m1", { market: "0xkcbuf", side: "yes", amount: 60_000, price: 0.6, at: NOW - 2 * H, wallet: PROVEN });
    await move("m2", { market: "0xkcbuf", side: "no", amount: 90_000, price: 0.4, at: NOW - 3 * H, wallet: NOBODY });
    await move("m3", { market: "0xkcbuf", side: "no", amount: 30_000, price: 0.12, at: NOW - 4 * H, wallet: FRESH, fresh: true, trackers: ["underdog-hunters"] });
    await move("m4", { source: "kalshi", market: "KXNFL-KCBUF", side: "yes", amount: 45_000, price: 0.41, at: NOW - 5 * H, trackers: ["underdog-hunters"] });
    await move("rec1", { market: "0xkcbuf", side: "no", amount: 40_000, price: 0.4, at: NOW - 26 * H, wallet: RECORDW });
    // A market with no proven money: only NOBODY's $25K on No.
    await move("none1", { market: "0xnone", side: "no", amount: 25_000, price: 0.3, at: NOW - 2 * H, wallet: NOBODY, title: "Curling final: Sweden?", outcome: "No", url: "https://polymarket.com/event/curling-final" });
    await move("m5", { market: "0xkcbuf", side: "yes", amount: 99_000, price: 0.55, at: NOW - 30 * H, wallet: PROVEN }); // older than 24h
    await pool.query(`insert into terminal.markets (venue, id, data) values ('polymarket', '0xkcbuf', $1), ('kalshi', 'KXNFL-KCBUF', $2), ('polymarket', '0xsen1', $3), ('polymarket', '0xsen2', $4)`, [
      JSON.stringify({ venue: "polymarket", id: "0xkcbuf", title: "Chiefs vs. Bills", eventTitle: "NFL: Chiefs vs. Bills", yesLabel: "Chiefs", noLabel: "Bills", url: "https://polymarket.com/event/chiefs-bills", yesPrice: 0.62, volume24h: 140_000, active: true, result: null, closeTime: NOW + 30 * H }),
      JSON.stringify({ venue: "kalshi", id: "KXNFL-KCBUF", title: "Will Buffalo beat Kansas City?", eventTitle: null, yesLabel: "Bills", noLabel: "Chiefs", url: "https://kalshi.com/markets/kxnfl/kc", yesPrice: 0.4, volume24h: null, active: true, result: null, closeTime: NOW + 30 * H }),
      JSON.stringify({ venue: "polymarket", id: "0xsen1", title: "Which party wins Senate control in 2026?", eventTitle: "Senate control", yesLabel: "Republicans", noLabel: "Democrats", url: "https://polymarket.com/event/senate", yesPrice: 0.7, volume24h: 900_000, active: true, result: null, closeTime: NOW + 400 * 24 * H }),
      JSON.stringify({ venue: "polymarket", id: "0xsen2", title: "Senate control after the 2026 midterms: Democrats?", eventTitle: "Senate control", yesLabel: "Yes", noLabel: "No", url: "https://polymarket.com/event/senate-d", yesPrice: 0.3, volume24h: 200_000, active: true, result: null, closeTime: NOW + 400 * 24 * H }),
    ]);
    // Search decoys: Kalshi combos and a Polymarket parlay with far more volume than the real markets; smaller lookalikes.
    const mk = (venue: string, id: string, title: string, eventTitle: string | null, vol: number, url: string) =>
      pool.query(`insert into terminal.markets (venue, id, data) values ($1, $2, $3)`, [venue, id, JSON.stringify({ venue, id, title, eventTitle, yesLabel: "Yes", noLabel: "No", url, yesPrice: 0.5, volume24h: vol, active: true, result: null, closeTime: NOW + 400 * 24 * H })]);
    await mk("kalshi", "KXSENATE-26", "Will Republicans control the Senate after 2026?", "Senate control", 300_000, "https://kalshi.com/markets/kxsenate/senate");
    await mk("kalshi", "KXMVESENATE-1", "yes Senate control R,yes House control R", null, 5_000_000, "https://kalshi.com/markets/kxmve/a");
    await mk("kalshi", "KXMVEHOUSE-1", "yes House control D,no Senate control D", null, 3_000_000, "https://kalshi.com/markets/kxmve/b");
    await mk("polymarket", "0xhouse1", "Which party wins House control in 2026?", "House control", 600_000, "https://polymarket.com/event/house-control-2026");
    await mk("polymarket", "0xhouse2", "House control: Republicans by 10+ seats?", "House control", 150_000, "https://polymarket.com/event/house-control-2026/house-gop-10");
    await mk("kalshi", "KXHOUSE-26", "Which party will control the House?", "House control", 250_000, "https://kalshi.com/markets/kxhouse/house");
    await mk("polymarket", "0xlal1", "Lakers vs. Celtics", "NBA: Lakers vs. Celtics", 300_000, "https://polymarket.com/event/nba-lal-bos");
    await mk("polymarket", "0xlal2", "Will the Lakers win the 2027 NBA Finals?", "NBA Champion 2027", 120_000, "https://polymarket.com/event/nba-champion-2027");
    await mk("polymarket", "0xbosnyk", "Celtics vs. Knicks", "NBA: Celtics vs. Knicks", 380_000, "https://polymarket.com/event/nba-bos-nyk");
    await mk("polymarket", "0xlalparlay", "Lakers win AND Over 220.5", "NBA parlays", 1_000_000, "https://polymarket.com/event/nba-parlays");
    await move("lal1", { market: "0xlal1", side: "yes", amount: 150_000, price: 0.55, at: NOW - 3 * H, wallet: NOBODY, title: "Lakers vs. Celtics", url: "https://polymarket.com/event/nba-lal-bos" });
    await pool.query(`insert into terminal.pairs (id, data, safety) values ('psen', $1, 'green'), ('phouse', $2, 'green')`, [
      JSON.stringify({ id: "psen", a: { venue: "polymarket", id: "0xsen1" }, b: { venue: "kalshi", id: "KXSENATE-26" }, inverted: false, method: "llm", confidence: 0.9, safety: "green", safetyNotes: [], blocked: false }),
      JSON.stringify({ id: "phouse", a: { venue: "polymarket", id: "0xhouse1" }, b: { venue: "kalshi", id: "KXHOUSE-26" }, inverted: false, method: "llm", confidence: 0.9, safety: "green", safetyNotes: [], blocked: false }),
    ]);
    await pool.query(`insert into terminal.pairs (id, data, safety) values ('pkc', $1, 'green')`, [JSON.stringify({ id: "pkc", a: { venue: "polymarket", id: "0xkcbuf" }, b: { venue: "kalshi", id: "KXNFL-KCBUF" }, inverted: true, method: "llm", confidence: 0.9, safety: "green", safetyNotes: [], blocked: false })]);
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("builds from either listing: proven money from proven wallets only, the last 24 hours of big bets, prices from both venues", async () => {
    const r = await buildRead(db, clients, "kalshi", "KXNFL-KCBUF", NOW);
    expect(r.key).toBe("p:0xkcbuf");
    expect(r).toMatchObject({ question: "Chiefs vs. Bills", yesLabel: "Chiefs", noLabel: "Bills" });
    expect(r.kalshi).toMatchObject({ id: "KXNFL-KCBUF", inverted: true, url: "https://kalshi.com/markets/kxnfl/kc" });
    // Proven money: PROVEN's open Chiefs money (m1 + m5, a winning followable record); Long Shots (a winning tracker)
    // on Bills through the fresh wallet's $30K and Kalshi's $45K (its YES is Bills); RECORDW's $40K on Bills (its public
    // record). NOBODY's $90K counts nowhere: a losing record, in a losing tracker.
    const p = r.proven;
    expect(p.yes).toEqual({ dollars: 159_000, wallets: 1, positions: 1 });
    expect(p.no).toEqual({ dollars: 115_000, wallets: 1, positions: 3 });
    expect(p.wallets).toBe(2);
    expect(p.yesShare).toBeCloseTo(159 / 274, 9);
    expect(p.trackers).toEqual([{ slug: "underdog-hunters", name: "Long Shots", returnPct: 0.375, settled: 32, sides: [{ side: "no", dollars: 75_000, positions: 2 }] }]);
    expect(p.walletRows).toEqual([
      { wallet: "0xaa…aa", side: "yes", dollars: 159_000, profit: null, closed: null, closedAtLeast: false, follow: { returnPct: 0.375, settled: 32 } },
      { wallet: "0xdd…dd", side: "no", dollars: 40_000, profit: 52_340, closed: 41, closedAtLeast: false, follow: null },
    ]);
    // Every open tracked large position, proven or not.
    expect(r.big).toEqual({ yes: { dollars: 159_000, positions: 2 }, no: { dollars: 205_000, positions: 4 }, yesShare: 159 / 364 });
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

  it("a market with no proven money says so and shows the big-money split instead", async () => {
    const r = await buildRead(db, clients, "polymarket", "0xnone", NOW);
    expect(r.proven.yesShare).toBeNull();
    expect(r.proven.trackers).toEqual([]);
    expect(r.proven.walletRows).toEqual([]);
    expect(r.big).toEqual({ yes: { dollars: 0, positions: 0 }, no: { dollars: 25_000, positions: 1 }, yesShare: 0 });
    expect(readHasMoney(r)).toBe(true);
    expect(templateLine(readFacts(r))).toBe("No proven money holds a position, and 100% of big money is on No; the largest is $25K on No at 30¢.");
  });

  it("search: combos and parlays left out, ranked by 24h volume plus tracked money, a paired Polymarket market preferred", async () => {
    const one = (venue: string, id: string) => ({ kind: "market", venue, id });
    expect(await resolveText(db, clients, "Chiefs Bills", NOW)).toEqual(one("polymarket", "0xkcbuf"));
    // The Senate and House control markets, not the Kalshi combos that mention them (with 5M and 3M of volume).
    expect(await resolveText(db, clients, "Senate control", NOW)).toEqual(one("polymarket", "0xsen1"));
    expect(await resolveText(db, clients, "House control", NOW)).toEqual(one("polymarket", "0xhouse1"));
    // Tonight's game ($300K volume plus $150K tracked), not the futures market or the $1M parlay.
    expect(await resolveText(db, clients, "Lakers", NOW)).toEqual(one("polymarket", "0xlal1"));
    // Asked for, a parlay is found.
    expect(await resolveText(db, clients, "Lakers parlay", NOW)).toEqual(one("polymarket", "0xlalparlay"));
    // Links: a Kalshi market; a Polymarket event (offline: what we hold under it) resolves to its main market.
    expect(await resolveText(db, clients, "https://kalshi.com/markets/kxsenate/senate/KXSENATE-26", NOW)).toEqual(one("kalshi", "KXSENATE-26"));
    expect(await resolveText(db, clients, "https://polymarket.com/event/house-control-2026", NOW)).toEqual(one("polymarket", "0xhouse1"));
    expect(await resolveText(db, clients, "https://kalshi.com/markets/kxnfl/nfl-game/KXNFL-KCBUF", NOW)).toEqual(one("kalshi", "KXNFL-KCBUF"));
    expect(await resolveText(db, clients, "https://polymarket.com/event/chiefs-bills", NOW)).toEqual(one("polymarket", "0xkcbuf"));
    expect((await resolveText(db, clients, "curling world cup", NOW)).kind).toBe("none");
    expect((await resolveText(db, clients, "NVDA", NOW)).kind).toBe("none");
  });

  it("search: markets the words fit equally without a clear leader become 3 choices", async () => {
    // Two Celtics games: $300K + $150K tracked against $380K is no clear lead.
    const s = await resolveText(db, clients, "Celtics", NOW);
    expect(s.kind === "choices" && s.list.map(c => c.id)).toEqual(["0xlal1", "0xbosnyk"]);
  });

  it("backfills public Polymarket records for every wallet from the last 90 days, cached for 24 hours; a wallet past the page cap is kept as \"at least\"", async () => {
    const OLD = "0xeeee" + "5".repeat(34) + "ee";
    await move("old1", { market: "0xancient", side: "yes", amount: 50_000, price: 0.5, at: NOW - 100 * 24 * H, wallet: OLD });
    // Never read first (PROVEN, FRESH); RECORDW and NOBODY were read an hour ago; OLD moved 100 days ago.
    expect((await walletsToBackfill(db, NOW, PROVEN_RECORD_TTL_MS, 10)).sort()).toEqual([FRESH, PROVEN].sort());
    expect((await walletsToBackfill(db, NOW + 24 * H, PROVEN_RECORD_TTL_MS, 10)).sort()).toEqual([FRESH, NOBODY, PROVEN, RECORDW].sort());
    // PROVEN (most recent first) has more closed positions than the cap: every page is full. FRESH has 35 closed markets.
    const full = (offset: number) => Array.from({ length: 50 }, (_, i) => ({ conditionId: `0xp${offset + i}`, outcomeIndex: 0, title: "M", avgPrice: 0.5, totalBought: 100, realizedPnl: 10, timestamp: NOW / 1000 }));
    const fresh = Array.from({ length: 35 }, (_, i) => ({ conditionId: `0xc${i}`, outcomeIndex: 0, title: `M${i}`, avgPrice: 0.5, totalBought: 1000, realizedPnl: i < 25 ? 400 : -300, timestamp: (NOW - i * H) / 1000 }));
    const pages: string[] = [], boards: string[] = [];
    const poly = {
      getClosedPositionsPage: async (w: string, o: { offset?: number }) => { pages.push(w); return w === PROVEN ? full(o.offset ?? 0) : o.offset ? [] : fresh; },
      // The wallet's own leaderboard row: pnl is read, nothing else.
      getLeaderboardUser: async (w: string) => { boards.push(w); return [{ rank: "7", proxyWallet: w, userName: "someone", vol: 9e6, pnl: w === PROVEN ? 1_234_567.891 : 6_950 }]; },
    } as unknown as PolymarketClient;
    expect(await provenBackfillOnce(db, poly, NOW, 2)).toBe(2);
    expect(pages.filter(w => w === PROVEN)).toHaveLength(RECORD_MAX_PAGES);
    expect(boards.sort()).toEqual([FRESH, PROVEN].sort());
    const got = await walletPnlFor(db, [FRESH, PROVEN]);
    expect(got.get(PROVEN)).toEqual({ closed: RECORD_MAX_PAGES * 50, closedAtLeast: true, pnl: 1_234_567.89 });
    expect(got.get(FRESH)).toEqual({ closed: 35, closedAtLeast: false, pnl: 6_950 });
    // Not dropped: the capped wallet is proven, and the Read says "at least".
    const r = await buildRead(db, clients, "polymarket", "0xkcbuf", NOW);
    expect(r.proven.walletRows!.find(w => w.wallet === "0xaa…aa")).toMatchObject({ profit: 1_234_568, closed: 5_000, closedAtLeast: true });
    expect(await walletsToBackfill(db, NOW, PROVEN_RECORD_TTL_MS, 10)).toEqual([]);
    // Nothing here touches trader_records (no win rate from a capped wallet's first pages).
    expect((await recordsFor(db, [FRESH, PROVEN])).size).toBe(0);
    await pool.query("delete from terminal.wallet_pnl where wallet = any($1)", [[FRESH, PROVEN]]);
  });

  it("free Read: a Read with no proven money and no big bets doesn't count; markets a \"Which one?\" offered stay open to pick", async () => {
    const who = { userId: null, visitorId: "v_rules" };
    const empty = await buildRead(db, clients, "polymarket", "0xsen2", NOW);
    expect(readHasMoney(empty)).toBe(false);
    const T = NOW - 60 * 24 * H; // outside /admin's windows below
    await saveRead(db, { ...who, input: "text", data: { ...empty, line: null }, ms: 50 }, T);
    expect(await readsUsed(db, who)).toBe(0);
    await saveRead(db, { ...who, input: "pick", data: { ...(await buildRead(db, clients, "polymarket", "0xkcbuf", NOW)), line: null }, ms: 50 }, T);
    expect(await readsUsed(db, who)).toBe(1);
    await saveOffer(db, who, ["polymarket:0xlal1", "polymarket:0xbosnyk"], NOW);
    expect(await wasOffered(db, who, "polymarket:0xbosnyk", NOW + 60_000)).toBe(true);
    expect(await wasOffered(db, who, "polymarket:0xkcbuf", NOW + 60_000)).toBe(false);
    expect(await wasOffered(db, who, "polymarket:0xbosnyk", NOW + READ_OFFER_MS + 1)).toBe(false);
    expect(await wasOffered(db, { userId: null, visitorId: "v_other" }, "polymarket:0xbosnyk", NOW)).toBe(false);
  });

  it("home: tonight's busiest markets that have proven money, one tap each", async () => {
    await pool.query(`insert into terminal.market_info (source, market_id, start_at) values ('polymarket', '0xkcbuf', $1), ('polymarket', '0xlal1', $1), ('polymarket', '0xnone', $1), ('polymarket', '0xsen1', $2)
      on conflict (source, market_id) do update set start_at = excluded.start_at`, [new Date(NOW + 2 * H), new Date(NOW + 300 * 24 * H)]);
    const rows = await tonightReads(db, NOW);
    // Only Chiefs vs. Bills: the Lakers game and the curling final have no proven money; Senate control isn't tonight.
    expect(rows.map(r => r.id)).toEqual(["0xkcbuf"]);
    expect(rows[0]).toMatchObject({ venue: "polymarket", title: "Chiefs vs. Bills", startAt: NOW + 2 * H });
    expect(rows[0]!.provenPositions).toBeGreaterThan(0);
  });

  it("caches a market for a minute; the line is written for members within a daily AI cap; one free Read per visitor", async () => {
    const a = await cachedRead(db, clients, "polymarket", "0xkcbuf", NOW);
    const b = await cachedRead(db, clients, "polymarket", "0xkcbuf", NOW + 1000);
    expect(b).toBe(a);
    await addAiSpend(db, "usr_capped", 5, NOW);
    expect(await aiSpent(db, "usr_capped", NOW)).toBe(5);
    const line = await lineFor(db, a, "usr_capped", NOW);
    expect(line).toMatchObject({ origin: "template", model: "template-capped" });
    expect(line.text).toMatch(/^58% of proven money is on Chiefs; the largest is \$90K on Bills at 40¢\.$/);
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
    // Proven money was 159K of 274K on Chiefs; PROVEN adds $100K on Bills.
    expect(mine[0]!.moved).toEqual({ from: 159_000 / 274_000, to: 159_000 / 374_000 });
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