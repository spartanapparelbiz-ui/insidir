import { describe, expect, it } from "vitest";
import { extractEntities, genericNames } from "@/lib/matching/entities";
import { kBtc100, kFedCut25, kNbaLal, kNewsom, kWx60, mk, pBtc100, pFedCut25, pNba } from "./fixtures/matching/markets";

describe("extractEntities", () => {
  it("reads a Kalshi game market: teams, league, winner type, YES subject", () => {
    const e = extractEntities(kNbaLal);
    expect(e.teams.sort()).toEqual(["nba:bos", "nba:lal"]);
    expect(e.league).toBe("nba");
    expect(e.type).toBe("winner");
    expect(e.yesSubject?.ids).toEqual(["team:nba:lal"]);
    expect(e.noSubject).toBeNull(); // Kalshi repeats the YES label as the NO label
  });
  it("reads a Polymarket game market with team outcomes", () => {
    const e = extractEntities(pNba);
    expect(e.yesSubject?.ids).toEqual(["team:nba:lal"]);
    expect(e.noSubject?.ids).toEqual(["team:nba:bos"]);
  });
  it("finds the subject in a 'Will X win' title", () => {
    const e = extractEntities(mk("polymarket", "x", { title: "Will the Lakers beat the Celtics?", category: "sports" }));
    expect(e.yesSubject?.ids).toEqual(["team:nba:lal"]);
  });
  it("does not turn ordinary words into teams outside a sports context", () => {
    const e = extractEntities(mk("polymarket", "x", { title: "Will the Senators confirm the nominee?", category: "politics" }));
    expect(e.teams).toEqual([]);
    const heat = extractEntities(mk("polymarket", "y", { title: "Will a heat wave hit Miami?", category: "weather" }));
    expect(heat.teams).toEqual([]);
    expect(heat.places).toEqual(["miami"]);
  });
  it("resolves ambiguous nicknames by league (Giants in an NFL market)", () => {
    const e = extractEntities(mk("kalshi", "x", { title: "Giants vs Eagles", seriesId: "KXNFLGAME", category: "sports" }));
    expect(e.teams.sort()).toEqual(["nfl:nyg", "nfl:phi"]);
  });
  it("reads thresholds with direction and inclusiveness, from the label and the structured strike", () => {
    const k = extractEntities(kBtc100);
    expect(k.type).toBe("threshold");
    expect(k.assets).toEqual(["btc"]);
    expect(k.thresholds).toEqual([{ direction: "above", value: 99999.99, upper: null, unit: "usd", inclusive: true }]);
    const p = extractEntities(pBtc100);
    expect(p.thresholds[0]).toMatchObject({ direction: "above", value: 100000, inclusive: false });
    expect(p.dates.map(d => d.key)).toEqual(["2026-11-05"]);
    expect(p.times[0]?.minutes).toBe(17 * 60);
  });
  it("reads ranges and over/under lines", () => {
    const r = extractEntities(mk("kalshi", "x", { title: "Bitcoin price range on Nov 5?", yesLabel: "$99,750 to $99,999.99" }));
    expect(r.thresholds[0]).toMatchObject({ direction: "between", value: 99750, upper: 99999.99 });
    const ou = extractEntities(mk("polymarket", "y", { title: "Lakers vs. Celtics: O/U 220.5", yesLabel: "Over", noLabel: "Under", category: "sports" }));
    expect(ou.type).toBe("total");
    expect(ou.thresholds[0]).toMatchObject({ direction: "above", value: 220.5 });
  });
  it("reads spreads", () => {
    const e = extractEntities(mk("polymarket", "x", { title: "Spread: Lakers (-5.5)", eventTitle: "Lakers vs. Celtics", yesLabel: "Lakers", noLabel: "Celtics", category: "sports" }));
    expect(e.type).toBe("spread");
    expect(e.thresholds[0]).toMatchObject({ direction: "above", value: 5.5 });
  });
  it("reads the Fed action as a condition and the move size as a number", () => {
    const k = extractEntities(kFedCut25);
    const p = extractEntities(pFedCut25);
    for (const e of [k, p]) {
      expect(e.orgs).toEqual(["fed"]);
      expect(e.conditions).toContain("cut");
      expect(e.numbers.map(n => n.value)).toEqual([0.25]);
      expect(e.dates.map(d => d.key)).toEqual(["2026-12"]);
    }
  });
  it("reads people from aliases and generic capitalised names", () => {
    expect(extractEntities(kNewsom).people).toEqual(["newsom"]);
    // Hyphenated surnames are keyed by their last part.
    expect(genericNames("Will Alexandria Smith-Jones win the Ohio primary?")).toEqual(["jones"]);
    expect(genericNames("Will The Super Bowl be held?")).toEqual([]);
  });
  it("reads weather markets: topic, place, threshold in degrees", () => {
    const e = extractEntities(kWx60);
    expect(e.orgs).toEqual(["high-temp"]);
    expect(e.places).toEqual(["ny"]);
    expect(e.thresholds[0]).toMatchObject({ direction: "above", value: 60 });
  });
  it("reads quoted words and the rules' scheduled date", () => {
    const e = extractEntities(mk("kalshi", "x", { title: "Will Trump say 'tariff' during his speech?", rules: "The speech scheduled for Nov 4, 2026." }));
    expect(e.quotes).toEqual(["tariff"]);
    expect(e.ruleDates.map(d => d.key)).toEqual(["2026-11-04"]);
  });
});
