/* The fixes from the live site (2026-10-28): one move per Polymarket position, sports markets on Sports, combos
 * hidden, titles keep their "Will", blocked usernames, stocks formatting, and no alerts copy until alerts are live.
 * The Postgres part (merging a position seen three times, collapsing old duplicates) runs against a throwaway
 * database next to E2E_DATABASE_URL. */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { checkPoly } from "@/lib/accuracy/check";
import * as schema from "@/lib/db/schema";
import { gammaCategory } from "@/lib/exchanges/polymarket";
import { trimTitle } from "@/lib/home/curate";
import { classify, looksLikeSport } from "@/lib/moves/classify";
import { isCombo } from "@/lib/moves/combos";
import { dollars, stockSentence } from "@/lib/moves/copy";
import { fromParts, mergeParts } from "@/lib/moves/detect";
import { isBlockedName } from "@/lib/moves/names";
import { walletLabel } from "@/lib/moves/records";
import { collapsePosition, duplicatePositions, listMoves, upsertMoves } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { companyWithClass, niceName, shareClassOf } from "@/lib/stocks/names";

const W = "0xe16d3f2a5807999b358affd9445c3a09e45e5e30", C = "0x522764b5de94956e169e37da5676f35f391ea17a3e5bc9da9ae07e92220103e1";
const T = Date.UTC(2026, 9, 28, 10, 0, 0);
const part = (n: number, c: number, p: number, dt: number) => ({ id: `0x${String(n).padStart(64, "a")}:${W}:${C}:0:${T + dt}`, c, p, at: T + dt });

describe("one move per position", () => {
  it("fills seen in any order merge by id: no double counting", () => {
    const a = [part(3, 1000, 0.5, 56_000)], b = [part(2, 2000, 0.5, 47_000), part(3, 1000, 0.5, 56_000)], c = [part(1, 4000, 0.5, 0), part(2, 2000, 0.5, 47_000)];
    const all = mergeParts(a, b, c);
    expect(all.map(p => p.at)).toEqual([T, T + 47_000, T + 56_000]);
    expect(fromParts(all)).toMatchObject({ amount: 3500, avgPrice: 0.5, at: T, lastAt: T + 56_000, fills: 3 });
  });
});

describe("Polymarket sports land on Sports", () => {
  it("a game id, sports market type or sport series makes it sports, even with no sports tag", () => {
    expect(gammaCategory(null, { sportsMarketType: "child_moneyline", gameId: "740546" })).toBe("sports");
    expect(gammaCategory({ series: [{ slug: "nba" }] }, null)).toBe("sports");
  });
  it("titles that can only be games: esports, totals, spreads, football 'Will X FC win'; never just 'vs'", () => {
    for (const t of ["Dota 2: PARIVISION vs Team Liquid - Game 1 Winner", "Nets vs. Celtics: O/U 217.5", "Spread: Lakers (-4.5)",
      "Will Arsenal FC win on 2026-10-27?", "Counter-Strike: Vitality vs Natus Vincere (BO3)", "Map Handicap: SRG (-1.5) vs KRÜ Blaze"]) {
      expect(looksLikeSport([t]), t).toBe(true);
      expect(classify("other", [t]).tab, t).toBe("sports");
    }
    for (const t of ["Trump vs. Harris: who wins the popular vote?", "Fed decision in December?", "Will Benjamin Netanyahu be the next Prime Minister of Israel?"]) {
      expect(classify("politics", [t]).tab, t).toBe("markets");
    }
    expect(classify("other", ["Will Arsenal FC win on 2026-10-27?"]).league).toBe("soccer");
  });
});

describe("the hourly accuracy check and positions", () => {
  it("a whole position (maker fills, buys more than 10 minutes apart) matches its source", async () => {
    const trades = [
      { proxyWallet: W, side: "BUY", size: 2000, price: 0.5, timestamp: T / 1000, conditionId: C, outcomeIndex: 0, outcome: "PARIVISION", transactionHash: `0x${"1".repeat(64)}` },
      { proxyWallet: W, side: "BUY", size: 4000, price: 0.5, timestamp: (T + 25 * 60_000) / 1000, conditionId: C, outcomeIndex: 0, outcome: "PARIVISION", transactionHash: `0x${"2".repeat(64)}` },
    ];
    const poly = { getWalletMarketTradesAll: async () => trades } as unknown as Parameters<typeof checkPoly>[0];
    const m = { id: "pm:x", source: "polymarket", marketId: C, wallet: W, outcomeSide: "yes", outcome: "PARIVISION", amount: 3000, at: T, lastAt: T + 25 * 60_000 } as unknown as Move;
    expect(await checkPoly(poly, m)).toEqual([]);
  });
});

describe("titles and combos", () => {
  it("keeps the question's 'Will'", () => {
    expect(trimTitle("Will Benjamin Netanyahu be the next Prime Minister?", 80)).toBe("Will Benjamin Netanyahu be the next Prime Minister?");
    expect(trimTitle("Will Arsenal FC win on 2026-10-27?", 80)).toBe("Will Arsenal FC win?");
  });
  it("multi-leg combos are combos; single markets aren't", () => {
    expect(isCombo({ source: "kalshi", marketId: "KXMVECROSSCATEGORY-S2026X", marketTitle: "yes Roma,yes Como" })).toBe(true);
    expect(isCombo({ source: "kalshi", marketId: "KXNHLGAME-26OCT27CBJPHI", marketTitle: "Columbus vs Philadelphia", outcome: "yes Roma,no Como wins by over 1.5 goals" })).toBe(true);
    expect(isCombo({ source: "polymarket", marketId: "0x1", marketTitle: "Lakers win AND Over 220.5 points" })).toBe(true);
    expect(isCombo({ source: "polymarket", marketId: "0x1", marketTitle: "Will Trump and Vance attend?" })).toBe(false);
    expect(isCombo({ source: "kalshi", marketId: "KXNBA-1", marketTitle: "Lakers vs Celtics winner?" })).toBe(false);
  });
});

describe("display names", () => {
  it("blocks hate codes and slurs, keeps ordinary names", () => {
    for (const n of ["Aryan88", "88", "1488", "14/88", "14 words", "WhiteP0wer", "n1gg3r", "N_I_G_G_E_R", "HH", "Sieg Heil", "KKK", "coon"]) expect(isBlockedName(n), n).toBe(true);
    for (const n of ["Raccoon", "Spice", "Dude1988", "sharkTrader", "Nigeria fan", "Theo4", "Chinkapin", "CSmith14", "shakshuka"]) expect(isBlockedName(n), n).toBe(false);
  });
  it("a blocked name shows the short 0x address", () => {
    expect(walletLabel(W, "Aryan88")).toBe("0xe1…30");
    expect(walletLabel(W, "Theo4")).toBe("Theo4");
  });
});

describe("stocks", () => {
  it("money in B and M", () => {
    expect(dollars(8_770_000_000)).toBe("$8.77B");
    expect(dollars(98_000_000)).toBe("$98M");
    expect(dollars(1_400_000)).toBe("$1.4M");
    expect(dollars(2_000_000_000)).toBe("$2B");
  });
  it("title case, no legal suffix, and the share class", () => {
    expect(niceName("BERKSHIRE HATHAWAY INC")).toBe("Berkshire Hathaway");
    expect(shareClassOf("ALPHABET INC CAP STK CL A")).toBe("A");
    expect(shareClassOf(null, "02079K107")).toBe("C");
    expect(companyWithClass("ALPHABET", "C")).toBe("Alphabet Class C");
    const fund = { kind: "fund" as const, company: "ALPHABET", cusip: "02079K305", fund: "TIGER GLOBAL MANAGEMENT LLC", fundCik: "1", period: "2026-09-30", filedOn: "2026-10-20",
      addedShares: 1, prevShares: 1, curShares: 2, curValue: 1, newPosition: false, accession: "a", prevAccession: "b" };
    expect(stockSentence(fund, 8_770_000_000)).toBe("13F · Q3 2026 · Tiger Global Management added $8.77B of Alphabet Class A.");
  });
});

describe("alerts copy only when alerts are live", () => {
  it("every alerts promise is behind isReady('alerts_push')", () => {
    const home = readFileSync("app/page.tsx", "utf8"), how = readFileSync("app/how-it-works/page.tsx", "utf8");
    // The home page promises no alerts at all (the tracker page's Follow says what following does).
    expect(home).not.toMatch(/alert to your phone|phone alerts/i);
    expect(how).toMatch(/isReady\("alerts_push"\) \? \[\["An alert on the next one"/);
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_live_${process.pid}`;
describe.skipIf(!URL0)("positions in Postgres", () => {
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

  const mv = (parts: ReturnType<typeof part>[]): Move => {
    const f = fromParts(parts);
    return { id: `pm:${W}:${C}:yes:${f.at}`, source: "polymarket", marketId: C, eventTitle: "Dota 2: PARIVISION vs Team Liquid", marketTitle: "Game 1 Winner",
      outcome: "PARIVISION", outcomeSide: "yes", wallet: W, walletName: null, tab: "sports", league: "other", category: "sports", url: null, result: null, settledAt: null, ...f, parts };
  };

  it("the same position seen three times (the feed delivered earlier fills late) is one move with every fill once", async () => {
    await upsertMoves(db, [mv([part(3, 25148, 0.5, 56_000)])]);
    await upsertMoves(db, [mv([part(2, 6000, 0.5, 47_000), part(3, 25148, 0.5, 56_000)])]);
    await upsertMoves(db, [mv([part(1, 2000, 0.5, 0), part(2, 6000, 0.5, 47_000), part(3, 25148, 0.5, 56_000)])]);
    const rows = await listMoves(db, { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 16574, at: T, fills: 3 });
  });

  it("old duplicates (no fills kept) collapse into the first row, rebuilt from the wallet's fills", async () => {
    await pool.query("truncate terminal.moves");
    for (const [i, amt] of [[0, 12574], [1, 15574], [2, 16574]] as const) {
      await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, fills, tab, category)
        values ($1, 'polymarket', $2, 'e', 'm', 'PARIVISION', 'yes', $3, 0.5, $4, $5, $5, 1, 'sports', 'sports')`, [`pm:dup:${i}`, C, amt, W, new Date(T + i * 1000)]);
    }
    await collapsePosition(db, ["pm:dup:0", "pm:dup:1", "pm:dup:2"], [part(1, 2000, 0.5, 0), part(2, 6000, 0.5, 47_000), part(3, 25148, 0.5, 56_000)]);
    const rows = (await pool.query("select id, amount from terminal.moves")).rows;
    expect(rows).toEqual([{ id: "pm:dup:0", amount: 16574 }]);
  });

  it("a settled move is never merged with a live one on the same position; merged refs stay a JSON array", async () => {
    await pool.query("truncate terminal.moves");
    for (const [id, result] of [["pm:s", "won"], ["pm:l1", null], ["pm:l2", null]] as const) {
      await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, fills, tab, category, result)
        values ($1, 'polymarket', $2, 'e', 'm', 'X', 'yes', 1000, 0.5, $3, now(), now(), 1, 'sports', 'sports', $4)`, [id, C, W, result]);
    }
    const groups = await duplicatePositions(db, 10);
    expect(groups.map(g => g.ids.sort())).toEqual([["pm:l1", "pm:l2"]]);
    await collapsePosition(db, groups[0]!.ids, null);
    const rows = (await pool.query("select id, jsonb_typeof(source_refs) as t from terminal.moves order by id")).rows;
    expect(rows).toEqual([{ id: "pm:l1", t: "array" }, { id: "pm:s", t: null }]);
  });

  it("combos never reach a list", async () => {
    await pool.query("truncate terminal.moves");
    await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, at, last_at, fills, tab, category)
      values ('ks:combo', 'kalshi', 'KXMVECROSSCATEGORY-X', 'yes Roma,yes Como', 'yes Roma,yes Como', 'yes Roma,yes Como', 'yes', 50000, 0.7, now(), now(), 1, 'sports', 'sports'),
             ('ks:single', 'kalshi', 'KXNHLGAME-1', 'Columbus vs Philadelphia', 'Columbus wins', 'Columbus', 'yes', 50000, 0.7, now(), now(), 1, 'sports', 'sports')`);
    expect((await listMoves(db, { limit: 10 })).map(m => m.id)).toEqual(["ks:single"]);
  });
});
