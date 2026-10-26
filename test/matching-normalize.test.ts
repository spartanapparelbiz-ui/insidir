import { describe, expect, it } from "vitest";
import { contentTokens, findAliases, findCaseSensitiveAliases, normalize, normalizePhrase } from "@/lib/matching/normalize";

const REF = Date.UTC(2026, 10, 1);

describe("normalize: numbers", () => {
  it("reads $100k, 100,000, 100K and $100,000.00 as the same value", () => {
    for (const t of ["above $100k", "above 100,000", "above 100K", "above $100,000.00", "above 0.1 million"]) {
      expect(normalize(t).numbers.map(n => n.value)).toEqual([100000]);
    }
  });
  it("tags currency, percent, basis points (as percent) and degrees", () => {
    const n = normalize("$1.5M and 4.25% and 25 bps and 60°F").numbers;
    expect(n.map(x => [x.value, x.unit])).toEqual([[1500000, "usd"], [4.25, "pct"], [0.25, "pct"], [60, "deg"]]);
  });
  it("does not read digits inside words (49ers, 76ers) as numbers", () => {
    expect(normalize("49ers vs 76ers").numbers).toEqual([]);
  });
  it("treats bare 19xx-21xx integers as years, but not after a direction word", () => {
    const a = normalize("Who wins the 2028 election?");
    expect(a.years).toEqual([2028]);
    expect(a.numbers).toEqual([]);
    expect(normalize("ETH above 2100").numbers.map(n => n.value)).toEqual([2100]);
  });
  it("marks counters (Week 9) and keeps spread signs", () => {
    expect(normalize("Week 9: Chiefs v. Bills").numbers[0]).toMatchObject({ value: 9, counter: true });
    expect(normalize("Spread: Lakers (-5.5)").numbers[0]).toMatchObject({ value: 5.5, sign: "-" });
  });
  it("turns 50+ into 'or more'", () => {
    expect(normalize("50+ goals").tokens.join(" ")).toContain("or more");
  });
});

describe("normalize: dates and times", () => {
  it("reads Nov 5, 11/5, November 5th, 2026 and 2026-11-05 as one date", () => {
    for (const t of ["on Nov 5", "on 11/5", "on November 5th, 2026", "2026-11-05", "on 5 November 2026", "Nov. 5, 2026"]) {
      expect(normalize(t, { refTime: REF }).dates.map(d => d.key)).toEqual(["2026-11-05"]);
    }
  });
  it("infers the year nearest the reference time, and leaves it open without one", () => {
    expect(normalize("Jan 3", { refTime: Date.UTC(2026, 11, 20) }).dates[0]?.key).toBe("2027-01-03");
    expect(normalize("Jan 3").dates[0]?.key).toBe("*-01-03");
  });
  it("reads month-year and lone full month names, not 'may' the verb", () => {
    expect(normalize("after the December 2026 meeting").dates[0]?.key).toBe("2026-12");
    expect(normalize("at the December meeting", { refTime: REF }).dates[0]?.key).toBe("2026-12");
    expect(normalize("Trump may say it").dates).toEqual([]);
  });
  it("reads times with timezones", () => {
    const t = normalize("at 5pm EDT").times[0];
    expect(t).toMatchObject({ minutes: 17 * 60, tz: "ET" });
    expect(normalize("12:00 in the ET timezone").times[0]).toMatchObject({ minutes: 720, tz: "ET" });
    expect(normalize("11:59 PM ET").times[0]?.minutes).toBe(23 * 60 + 59);
  });
  it("strips ordinal suffixes", () => {
    expect(normalize("the 3rd game").numbers[0]?.value).toBe(3);
  });
});

describe("normalize: words", () => {
  it("unifies vs, v., @ and versus", () => {
    for (const t of ["Lakers vs Celtics", "Lakers vs. Celtics", "Lakers v. Celtics", "Lakers @ Celtics", "Lakers versus Celtics"]) {
      expect(normalize(t).tokens).toEqual(["lakers", "vs", "celtics"]);
    }
  });
  it("maps word variants (decreases → cut, Democrats → democratic, no change → hold)", () => {
    expect(normalize("Fed decreases rates").tokens).toContain("cut");
    expect(normalize("Democrats win").tokens).toContain("democratic");
    expect(normalize("No change in Fed rates").tokens).toContain("hold");
  });
  it("drops stopwords and type words from content tokens", () => {
    expect(contentTokens(normalize("Will the Lakers win the game?").tokens)).toEqual(["lakers"]);
  });
  it("protects S&P 500 and U.S. before number parsing", () => {
    const n = normalize("Will the S&P 500 close above 6,500?");
    expect(n.numbers.map(x => x.value)).toEqual([6500]);
    expect(findAliases(n.tokens).map(h => h.refs[0]?.id)).toEqual(["spx"]);
    expect(findCaseSensitiveAliases("Will the U.S. enter a recession?").map(x => x.refs[0]?.id)).toEqual(["us"]);
  });
});

describe("aliases", () => {
  const ids = (t: string) => findAliases(normalize(t).tokens).flatMap(h => h.refs.map(r => `${r.kind}:${r.id}`));
  it("knows Lakers, Los Angeles Lakers and Kalshi's 'Los Angeles L'", () => {
    expect(ids("Lakers")).toContain("team:nba:lal");
    expect(ids("Los Angeles Lakers")).toContain("team:nba:lal");
    expect(ids("Los Angeles L")).toContain("team:nba:lal");
    expect(findCaseSensitiveAliases("LAL at BOS").flatMap(x => x.refs.map(r => r.id))).toContain("nba:lal");
  });
  it("knows crypto, the Fed and politicians", () => {
    expect(ids("Bitcoin")).toEqual(["asset:btc"]);
    expect(ids("BTC")).toEqual(["asset:btc"]);
    expect(ids("FOMC")).toEqual(["org:fed"]);
    expect(ids("Federal Reserve")).toEqual(["org:fed"]);
    expect(ids("J.D. Vance")).toEqual(["person:vance"]);
  });
  it("normalizePhrase is stable", () => {
    expect(normalizePhrase("  St. Louis  Cardinals ")).toBe("st louis cardinals");
  });
});
