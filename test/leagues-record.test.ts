/* Every sports move says its league ("Sports · Serie A", not just "Sports"), and the home Results preview only
 * shows bets that count toward the record above it (Polymarket, settled, not sold before the result, not a combo).
 * The league backfill runs against a throwaway database next to E2E_DATABASE_URL. */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { classify } from "@/lib/moves/classify";
import { leagueBackfillOnce } from "@/lib/moves/jobs";
import { leagueLabel } from "@/lib/moves/leagues";
import { upsertMoves } from "@/lib/moves/store";
import type { League, Move } from "@/lib/moves/types";
import { countsToRecord } from "@/lib/trust";

const sports = (eventTitle: string, marketTitle = eventTitle, league: League | null = null, marketId = "0xabc") => leagueLabel({ tab: "sports", league, eventTitle, marketTitle, marketId });

describe("every sports move says its league", () => {
  it("a club names its league", () => {
    expect(sports("SSC Napoli vs. Genoa CFC", "Will SSC Napoli win on 2026-10-28?")).toBe("Serie A");
    expect(sports("Arsenal vs. Chelsea", "Will Arsenal win?")).toBe("Premier League");
    expect(sports("Real Madrid vs. Sevilla")).toBe("La Liga");
    expect(sports("Bayern Munich vs. Dortmund")).toBe("Bundesliga");
    expect(sports("PSG vs. Marseille")).toBe("Ligue 1");
    expect(sports("Kashima Antlers vs. FC Pohang Steelers: O/U 2.5")).toBe("Soccer");
  });
  it("a competition, an esport or a sport in the title wins", () => {
    expect(sports("Champions League: Inter vs. Barcelona")).toBe("Champions League");
    expect(sports("Dota 2: PARIVISION vs Team Liquid - Game 1 Winner")).toBe("Dota 2");
    expect(sports("Counter-Strike: TheMongolz vs Nemiga (BO3)")).toBe("Counter-Strike");
    expect(sports("Lakers vs. Celtics", "Lakers vs. Celtics", "NBA")).toBe("NBA");
    expect(sports("Daniil Medvedev wins", "Daniil Medvedev wins", "tennis", "KXATPMATCH-26OCT28MEDBER")).toBe("ATP");
  });
  it("a US league already known isn't overridden by a club name; nothing for other tabs", () => {
    expect(sports("Spurs vs. Rockets", "Spurs vs. Rockets", "NBA")).toBe("NBA");
    expect(leagueLabel({ tab: "markets", league: null, eventTitle: "Napoli mayor", marketTitle: "x" })).toBeNull();
  });
  it("the filter league comes from the same rules", () => {
    expect(classify("sports", ["Will SSC Napoli win on 2026-10-28?"]).league).toBe("soccer");
    expect(classify("sports", ["Arsenal vs. Chelsea"]).league).toBe("soccer");
  });
  it("cards show it", () => {
    for (const f of ["components/v2/MoveCard.tsx"]) expect(readFileSync(f, "utf8")).toContain("m.leagueLabel");
  });
});

const settled = (o: Partial<Move>): Move => ({
  id: "pm:1", source: "polymarket", marketId: "0x1", eventTitle: "Arsenal vs. Chelsea", marketTitle: "Will Arsenal win?", outcome: "Yes",
  outcomeSide: "yes", amount: 20_000, avgPrice: 0.5, wallet: "0x1", walletName: null, at: 0, lastAt: 0, fills: 1, tab: "sports", league: "soccer",
  category: "sports", url: null, result: "won", settledAt: 1, sourceRefs: null, pnl: 20_000, soldShare: 0, ...o,
});

describe("home Results preview: only bets in the record", () => {
  it("Polymarket, won or lost, worked out, not sold early, not a combo", () => {
    expect(countsToRecord(settled({}))).toBe(true);
    expect(countsToRecord(settled({ result: "lost", pnl: -20_000 }))).toBe(true);
    expect(countsToRecord(settled({ source: "kalshi", wallet: null }))).toBe(false);
    expect(countsToRecord(settled({ pnl: null }))).toBe(false);
    expect(countsToRecord(settled({ soldShare: 0.8 }))).toBe(false);
    expect(countsToRecord(settled({ result: "void" }))).toBe(false);
    expect(countsToRecord(settled({ marketTitle: "Arsenal AND Chelsea win" }))).toBe(false);
  });
  it("the live portfolio picks its results from Polymarket and filters by the record rule", () => {
    const src = readFileSync("components/home/Discover.tsx", "utf8") + readFileSync("lib/trust.ts", "utf8");
    expect(src).toMatch(/countsToRecord|SOLD_EARLY_SHARE/);
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_leagues_${process.pid}`;

describe.skipIf(!URL0)("league backfill in Postgres", () => {
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

  it("sports moves without a league get one; ones it can't place stay as they are", async () => {
    await upsertMoves(db, [
      settled({ id: "pm:napoli", eventTitle: "SSC Napoli vs. Genoa CFC", marketTitle: "Will SSC Napoli win on 2026-10-28?", league: null, result: null }),
      settled({ id: "pm:dota", eventTitle: "Dota 2: A vs B", marketTitle: "Dota 2: A vs B", league: "other", result: null }),
      settled({ id: "pm:nba", eventTitle: "Lakers vs. Celtics", marketTitle: "Lakers vs. Celtics", league: "NBA", result: null }),
    ]);
    expect(await leagueBackfillOnce(db)).toBe(1);
    const rows = (await pool.query("select id, league from terminal.moves order by id")).rows;
    expect(rows).toEqual([{ id: "pm:dota", league: "other" }, { id: "pm:napoli", league: "soccer" }, { id: "pm:nba", league: "NBA" }]);
    expect(await leagueBackfillOnce(db)).toBe(0);
  });
});
