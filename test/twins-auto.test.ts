/* Auto-approval from the venues' structured data only (lib/twins/structured.ts), on today's real pairs: an NBA
 * moneyline, its spreads and totals (all five fields from slugs, tickers, outcome names, line fields, sources and close
 * times), and the Texas Senate race (which stays with a person: Polymarket states no resolution source, and Kalshi
 * closes at the swearing-in, a year later). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autoCheck, kalshiGame, kalshiRace, polyGame, polyRace } from "@/lib/twins/structured";
import { dailyMessage, etBounds, etDay } from "@/lib/twins/daily";
import type { VMarket } from "@/lib/types";

const load = (n: string) => JSON.parse(readFileSync(`test/fixtures/twins/${n}.json`, "utf8")) as { kalshi: VMarket[]; polymarket: VMarket[] };
const ml = load("nba-moneyline"), sp = load("nba-spread"), tot = load("nba-total"), tx = load("texas-senate");
const poly = (l: VMarket[], type: string, line?: number, yes?: string) => l.find(m => m.ids?.sportsMarketType === type && (line === undefined || m.ids?.line === line) && (yes === undefined || m.yesLabel === yes))!;

describe("structured ids", () => {
  it("reads the game from Polymarket's event slug and Kalshi's event ticker", () => {
    expect(polyGame("nba-atl-was-2026-11-04")).toEqual({ league: "nba", date: "2026-11-04", teams: ["ATL", "WAS"] });
    expect(kalshiGame("KXNBASPREAD-26NOV04ATLWAS")).toEqual({ league: "nba", date: "2026-11-04", teams: ["ATL", "WAS"], type: "SPREAD" });
    expect(polyGame("hawks-vs-wizards")).toBeNull();
    expect(kalshiRace("SENATETX-26")).toEqual({ state: "texas", office: "senate", year: "2026" });
    expect(polyRace("texas-senate-election-winner")).toEqual({ state: "texas", office: "senate" });
  });
});

describe("auto-approve only when all five fields match from structured data", () => {
  it("NBA moneyline: Hawks ↔ -ATL auto-approves; Hawks ↔ -WAS never", () => {
    const hawks = poly(ml.polymarket, "moneyline");
    const atl = ml.kalshi.find(k => k.id.endsWith("-ATL"))!, was = ml.kalshi.find(k => k.id.endsWith("-WAS"))!;
    const a = autoCheck(hawks, atl);
    expect(a).toMatchObject({ auto: true, kind: "moneyline" });
    expect(a.fields).toEqual({ event: "match", outcome: "match", line: "match", rules: "match", close: "match" });
    expect(autoCheck(hawks, was)).toMatchObject({ auto: false, fields: { outcome: "differs" } });
  });

  it("NBA spreads: the same exact number auto-approves; one point off never", () => {
    const h45 = poly(sp.polymarket, "spreads", -4.5, "Hawks");
    const k = (n: number, team: string) => sp.kalshi.find(m => m.id.startsWith(`${m.eventId}-${team}`) && m.ids?.floorStrike === n)!;
    expect(autoCheck(h45, k(4.5, "ATL"))).toMatchObject({ auto: true, kind: "spread" });
    expect(autoCheck(h45, k(5.5, "ATL"))).toMatchObject({ auto: false, fields: { line: "differs" } });
    expect(autoCheck(h45, k(4.5, "WAS"))).toMatchObject({ auto: false, fields: { outcome: "differs" } });
  });

  it("NBA totals: Over at the same exact number auto-approves; another number never", () => {
    const o = poly(tot.polymarket, "totals", 230.5);
    const k = (n: number) => tot.kalshi.find(m => m.ids?.floorStrike === n)!;
    expect(autoCheck(o, k(230.5))).toMatchObject({ auto: true, kind: "total" });
    expect(autoCheck(o, k(232.5))).toMatchObject({ auto: false, fields: { line: "differs" } });
  });

  it("Texas Senate: the same race and candidate, but no stated source on Polymarket and a close a year apart: a person decides", () => {
    const p = tx.polymarket.find(m => m.ids?.group === "James Talarico (D)")!, k = tx.kalshi.find(m => m.ids?.yesSub === "James Talarico")!;
    const a = autoCheck(p, k);
    expect(a).toMatchObject({ auto: false, kind: "candidate", fields: { event: "match", outcome: "match", line: "match", rules: "unknown", close: "differs" } });
    const paxton = tx.kalshi.find(m => m.ids?.yesSub === "Ken Paxton")!;
    expect(autoCheck(p, paxton).fields.outcome).toBe("differs");
  });

  it("a market matched only by its title (no structured ids) never auto-approves", () => {
    const hawks = { ...poly(ml.polymarket, "moneyline"), ids: null };
    expect(autoCheck(hawks, ml.kalshi[0]!).auto).toBe(false);
  });
});


describe("the daily list", () => {
  it("ET days, across the DST change (Nov 1, 2026)", () => {
    expect(etBounds("2026-11-04")).toEqual({ from: Date.parse("2026-11-04T05:00:00Z"), to: Date.parse("2026-11-05T05:00:00Z") });
    expect(etBounds("2026-10-30")).toEqual({ from: Date.parse("2026-10-30T04:00:00Z"), to: Date.parse("2026-10-31T04:00:00Z") });
    expect(etDay(Date.parse("2026-11-04T13:30:00Z"))).toEqual({ day: "2026-11-04", hour: 8 });
  });
  it("names how many and the first three, and links to the day's list", () => {
    const m = dailyMessage([{ polymarketTitle: "Hawks vs. Wizards", kalshiTitle: "Atlanta wins" }, { polymarketTitle: "Spread: Hawks (-4.5)", kalshiTitle: "x" }], "2026-11-04");
    expect(m.title).toBe("2 twins approved themselves");
    expect(m.body).toBe("2026-11-04: Hawks vs. Wizards; Spread: Hawks (-4.5). Revoke any in one click.");
    expect(m.url).toMatch(/\/admin\/twins\?view=auto&day=2026-11-04$/);
  });
});

describe("twins for the games millionaires bet on, by game (lib/twins/direct.ts)", () => {
  it("goes from Polymarket's event slug to Kalshi's game tickers, both team orders", async () => {
    const { gameTickers } = await import("@/lib/twins/direct");
    const t = gameTickers("nba-phx-gsw-2026-11-02");
    expect(t.slice(0, 2)).toEqual(["KXNBAGAME-26NOV02PHXGSW", "KXNBAGAME-26NOV02GSWPHX"]);
    expect(gameTickers("nfl-kc-buf-2026-11-08")[0]).toBe("KXNFLGAME-26NOV08KCBUF");
    expect(gameTickers("texas-senate-election-winner")).toEqual([]);
  });
  it("pairs each market of a game with its one Kalshi market by the five fields: moneyline, every spread, every total", async () => {
    const { pairByStructure } = await import("@/lib/twins/direct");
    const uniq = (l: VMarket[]) => [...new Map(l.map(m => [m.id, m])).values()];
    const pairs = pairByStructure(uniq([...ml.polymarket, ...sp.polymarket, ...tot.polymarket]), uniq([...ml.kalshi, ...sp.kalshi, ...tot.kalshi]));
    const kinds = new Set(pairs.map(p => autoCheck(p.poly, p.kalshi).kind));
    expect([...kinds].sort()).toEqual(["moneyline", "spread", "total"]);
    for (const p of pairs) expect(autoCheck(p.poly, p.kalshi).auto).toBe(true);
    // One Kalshi market each, never two Polymarket markets on the same Kalshi one.
    expect(new Set(pairs.map(p => p.kalshi.id)).size).toBe(pairs.length);
  });
});
