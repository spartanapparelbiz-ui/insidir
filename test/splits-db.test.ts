/* Splits in Postgres (lib/smart/store.ts): proven traders' open positions in, splits out, flagged once, scored when
 * they end. The venue is a stand-in that answers like Polymarket's Gamma and Data APIs. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { PolymarketClient, PolymarketPosition } from "@/lib/exchanges/polymarket";
import type { VMarket } from "@/lib/types";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_splits_${process.pid}`;
const NOW = Date.UTC(2026, 9, 29, 15), DAY = 86_400_000;
const P1 = "0x" + "a".repeat(40), P2 = "0x" + "b".repeat(40), P3 = "0x" + "e".repeat(40), NOPE = "0x" + "c".repeat(40);
const FED = "0xfed", GAME = "0xgame";

function position(wallet: string, conditionId: string, outcomeIndex: number, money: number, cur: number): PolymarketPosition {
  return { wallet, conditionId, tokenId: null, title: conditionId === FED ? "Fed cut in December?" : "Brewers vs. Cubs", outcome: outcomeIndex === 0 ? (conditionId === FED ? "Yes" : "Brewers") : (conditionId === FED ? "No" : "Cubs"),
    outcomeIndex, size: money / 0.5, avgPrice: 0.5, initialValue: money, currentValue: null, cashPnl: null, percentPnl: null, realizedPnl: null, curPrice: cur,
    redeemable: false, mergeable: false, negativeRisk: false, endDate: NOW + 30 * DAY, url: "" };
}

function market(id: string, over: Partial<VMarket>): VMarket {
  return { venue: "polymarket", id, eventId: "e", seriesId: null, title: id === FED ? "Fed cut in December?" : "Brewers vs. Cubs", eventTitle: id === FED ? "Fed in December" : "MLB",
    yesLabel: id === FED ? "Yes" : "Brewers", noLabel: id === FED ? "No" : "Cubs", rules: "", resolutionSource: null, closeTime: null,
    category: id === FED ? "economics" : "sports", fee: { kind: "none" } as never, url: `https://polymarket.com/${id}`, yesTokenId: null, noTokenId: null, strike: null,
    active: true, result: null, volume24h: null, ...over };
}

describe.skipIf(!URL0)("splits in Postgres", () => {
  let admin: pg.Client, pool: pg.Pool, db: Db;
  const prev = process.env.FEATURES_READY;
  const asked: string[] = [];
  let venue = new Map<string, VMarket>();
  const poly = {
    // Three proven traders, every position $2K+ (a smaller one never counts: P2's $1,500 on the Fed NO).
    getPositions: async (w: string) => { asked.push(w); return w === P1 ? [position(P1, FED, 0, 6000, 0.62), position(P1, GAME, 1, 3000, 0.3)]
      : w === P2 ? [position(P2, FED, 0, 2000, 0.62), position(P2, FED, 1, 1500, 0.38), position(P2, GAME, 1, 2000, 0.3)]
      : w === P3 ? [position(P3, FED, 1, 2000, 0.38), position(P3, GAME, 1, 2000, 0.3)] : []; },
    getMarketsById: async (ids: readonly string[]) => new Map(ids.flatMap(id => (venue.has(id) ? [[id, venue.get(id)!] as const] : []))),
  } as unknown as PolymarketClient;

  beforeAll(async () => {
    process.env.FEATURES_READY = "feed,records,follows,stocks";
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  afterAll(async () => { process.env.FEATURES_READY = prev; await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("proven traders' positions → crowd and game splits, flagged once, shown on cards and pages, scored when settled", async () => {
    const { saveRecord } = await import("@/lib/moves/store");
    const { provenOpenOnce, marketSplitsOnce, liveSplits, splitsFor, marketSmart, resolveSplitsOnce, flaggedSplits, saveOpen } = await import("@/lib/smart/store");
    const rec = (wallet: string, proven: boolean) => saveRecord(db, { wallet, name: null, resolved: 30, won: 21, lost: 9, profit: 1000, biggestWin: 100, avgPrice: 0.6, proven, updatedAt: NOW });
    await rec(P1, true); await rec(P2, true); await rec(P3, true); await rec(NOPE, false);
    // A non-proven wallet's money never counts, even when stored.
    await saveOpen(db, NOPE, [position(NOPE, FED, 1, 50_000, 0.62)], NOW);

    expect(await provenOpenOnce(db, poly, NOW)).toBe(3);
    expect(asked.sort()).toEqual([P1, P2, P3].sort());
    expect(await provenOpenOnce(db, poly, NOW + 60_000)).toBe(0); // read 1 minute ago: fresh

    // All big money on the game: $70K Brewers, $30K Cubs.
    await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, at, last_at, tab, category)
      values ('pm:g1', 'polymarket', $1, 'MLB', 'Brewers vs. Cubs', 'Brewers', 'yes', 70000, 0.6, $2, $2, 'sports', 'sports'),
             ('pm:g2', 'polymarket', $1, 'MLB', 'Brewers vs. Cubs', 'Cubs', 'no', 30000, 0.4, $2, $2, 'sports', 'sports')`, [GAME, new Date(NOW - DAY)]);
    venue = new Map([[FED, market(FED, { yesPrice: 0.62 })], [GAME, market(GAME, { yesPrice: 0.7 })]]);

    const r = await marketSplitsOnce(db, poly, NOW);
    expect(r.markets).toBe(2);
    // Fed: proven money $8,000 YES of $10,000 = 80% vs. the price 62% → 18 points. Game: big bets 70% Brewers vs.
    // proven 0% Brewers (all $7,000 on the Cubs, priced 30%) → opposite ways, 70 points; the crowd split there too.
    const live = await liveSplits(db, { until: NOW });
    expect(live.map(s => [s.kind, s.subject, s.gap])).toEqual([["crowd", GAME, 70], ["bigmoney", GAME, 70], ["crowd", FED, 18]]);
    const fed = live.find(s => s.subject === FED)!;
    expect(fed).toMatchObject({ crowd: 0.62, smartSide: "yes", tab: "markets", flaggedGap: 18 });
    expect(fed.smart).toBeCloseTo(0.8);
    expect(r.flagged.sort()).toEqual([`bigmoney:${GAME}`, `crowd:${FED}`, `crowd:${GAME}`]);
    expect((await marketSplitsOnce(db, poly, NOW + 60_000)).flagged).toEqual([]); // flagged once

    expect((await splitsFor(db, [FED, "0xnone"])).get(FED)?.crowd?.gap).toBe(18);
    const page = await marketSmart(db, GAME, NOW);
    expect(page).toMatchObject({ smart: { yes: 0, no: 7000, wallets: 3, share: 0 }, big: { yes: 70000, no: 30000 } });
    // Free viewers see a split 30 minutes after it was first seen.
    expect(await liveSplits(db, { until: NOW - 30 * 60_000 })).toEqual([]);

    // The Fed market settles YES: smart money (leaning YES against the crowd) was right. The game goes to the
    // Brewers: proven traders (on the Cubs) were wrong. Both stay on the scorecard.
    venue = new Map([[FED, market(FED, { result: "yes", active: false })], [GAME, market(GAME, { result: "yes", active: false })]]);
    expect(await resolveSplitsOnce(db, poly, NOW + DAY)).toBe(3);
    const card = await flaggedSplits(db);
    expect(card.map(s => [s.id, s.smartRight]).sort()).toEqual([[`bigmoney:${GAME}`, false], [`crowd:${FED}`, true], [`crowd:${GAME}`, false]]);
    expect(await liveSplits(db, { until: NOW + DAY })).toEqual([]);
  });

  it("insiders buying the dip, scored 90 days later", async () => {
    const { stockSplitsOnce, resolveSplitsOnce, flaggedSplits } = await import("@/lib/smart/store");
    const at = new Date(NOW - 2 * DAY);
    const d = { kind: "insider", company: "Acme Corp", ticker: "ACME", issuerCik: "1", role: "CEO", ownerName: "Jane Roe", ownerCik: "2", shares: 10000, pricePerShare: 80, tradeDate: "2026-10-26", filedAt: at.getTime(), accession: "a" };
    await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, at, last_at, tab, category, detail)
      values ('sec:1', 'sec', 'acme', 'Acme Corp', 'Acme Corp', 'Buy', 'yes', 800000, 0, $1, $1, 'stocks', 'stocks', $2)`, [at, JSON.stringify(d)]);
    // 100 until Sep 26, 80 from Oct 20: −20% over the 30 days to Oct 26; then 90 for the rest of the year.
    const rows: string[] = [];
    for (let t = Date.UTC(2026, 7, 1); t <= Date.UTC(2027, 1, 28); t += DAY) {
      const date = new Date(t).toISOString().slice(0, 10);
      rows.push(`('ACME', '${date}', ${date < "2026-10-20" ? 100 : date < "2026-11-01" ? 80 : 90})`);
    }
    await pool.query(`insert into terminal.stock_closes (ticker, date, close) values ${rows.join(", ")}`);
    const r = await stockSplitsOnce(db, NOW);
    expect(r.flagged).toEqual(["insider_dip:ACME:2026-10-26"]);
    const s = (await flaggedSplits(db)).find(x => x.kind === "insider_dip")!;
    expect(s).toMatchObject({ gap: 20, smartSide: "up", title: "Insiders buying the dip: Acme", detail: { ticker: "ACME", owners: ["Jane Roe"], value: 800000 } });
    expect(await resolveSplitsOnce(db, {} as PolymarketClient, NOW + 30 * DAY)).toBe(0); // too soon
    expect(await resolveSplitsOnce(db, {} as PolymarketClient, NOW + 91 * DAY)).toBe(1);
    // Flagged Oct 29 at 80 → 90 by late January: +12.5%, insiders right.
    expect((await flaggedSplits(db)).find(x => x.kind === "insider_dip")).toMatchObject({ outcome: "up", smartRight: true, detail: { change: 12.5 } });
  });
});
