import { describe, expect, it } from "vitest";
import { assessSafety, extractRuleFacts } from "@/lib/matching/safety";
import { at, kBtc100, kNbaLal, kNewsom, kNflKc, kWx60, mk, pBtc100, pNba, pNewsom, pNfl, pWx60 } from "./fixtures/matching/markets";

describe("extractRuleFacts", () => {
  it("finds resolution sources", () => {
    expect(extractRuleFacts(kBtc100.rules, null, kBtc100.closeTime).sources).toEqual(["CF Benchmarks / CME"]);
    expect(extractRuleFacts(pBtc100.rules, null, pBtc100.closeTime).sources).toEqual(["Binance"]);
    expect(extractRuleFacts("Results as called by the Associated Press.", null, null).sources).toEqual(["AP"]);
    expect(extractRuleFacts("", "https://www.coingecko.com/en/coins/bitcoin", null).sources).toEqual(["CoinGecko"]);
    expect(extractRuleFacts("", "https://data.example.org/x", null).sources).toEqual(["data.example.org"]);
  });
  it("finds cutoff times and dates", () => {
    const f = extractRuleFacts(pBtc100.rules, null, pBtc100.closeTime);
    expect(f.times[0]).toMatchObject({ minutes: 17 * 60, tz: "ET" });
    expect(f.dates.map(d => d.key)).toEqual(["2026-11-05"]);
  });
  it("reads overtime / regulation clauses", () => {
    expect(extractRuleFacts("The outcome includes overtime.", null, null).overtime).toBe("included");
    expect(extractRuleFacts("Regulation time only; extra time does not count.", null, null).overtime).toBe("excluded");
    expect(extractRuleFacts("The score at the end of regulation or overtime counts.", null, null).overtime).toBe("included");
    expect(extractRuleFacts("Includes overtime. Regulation time only.", null, null).overtime).toBeNull(); // contradictory
    expect(extractRuleFacts("Winner of the game.", null, null).overtime).toBeNull();
  });
  it("reads postponement and tie clauses", () => {
    const f = extractRuleFacts(
      "If the game is postponed, the market remains open until the game is played. If the game is cancelled, it resolves 50-50. If the match ends in a draw, the market resolves to No.",
      null,
      null,
    );
    expect(f.postponed).toEqual(["split", "wait"]);
    expect(f.tie).toEqual(["no"]);
  });
  it("reads dollar thresholds in the rules", () => {
    expect(extractRuleFacts(kBtc100.rules, null, null).thresholds[0]).toMatchObject({ direction: "above", value: 99999.99 });
  });
});

describe("assessSafety", () => {
  it("GREEN: same event, same date, same rules", () => {
    expect(assessSafety(kNflKc, pNfl, { inverted: false })).toEqual({ safety: "green", notes: [], mismatch: [] });
    expect(assessSafety(kNewsom, pNewsom, { inverted: false }).safety).toBe("green");
  });
  it("YELLOW: Kalshi counts overtime, Polymarket's rules don't mention it", () => {
    const s = assessSafety(kNbaLal, pNba, { inverted: false });
    expect(s.safety).toBe("yellow");
    expect(s.notes).toContain("Kalshi counts overtime; Polymarket's rules don't mention it");
  });
  it("YELLOW: different resolution sources", () => {
    const s = assessSafety(kWx60, pWx60, { inverted: false });
    expect(s.safety).toBe("yellow");
    expect(s.notes).toContain("Different resolution sources: NWS/NOAA vs Weather Underground");
    expect(s.mismatch).toEqual(["source"]);
  });
  it("YELLOW: AP vs official results, and the boundary of a threshold", () => {
    const a = mk("kalshi", "a", { title: "Will Smith win the Ohio Senate race in 2026?", rules: "Resolves per the Associated Press race call." });
    const b = mk("polymarket", "b", { title: "Will Smith win the Ohio Senate race in 2026?", rules: "Resolves per certified results from the Ohio Secretary of State." });
    expect(assessSafety(a, b, { inverted: false }).notes).toContain("Different resolution sources: AP vs official results");
    const btc = assessSafety(kBtc100, pBtc100, { inverted: false });
    expect(btc.safety).toBe("yellow");
    expect(btc.mismatch).toContain("threshold");
    expect(btc.notes.join(" | ")).toMatch(/Boundary differs: Kalshi counts exactly \$100,000 as YES; Polymarket counts exactly \$100,000 as NO/);
  });
  it("YELLOW: closes hours apart; postponement clauses differ", () => {
    const a = mk("kalshi", "a", { title: "Lakers vs Celtics", category: "sports", yesLabel: "Lakers", closeTime: at(2026, 11, 6, 0), rules: "If the game is postponed, the market resolves to No." });
    const b = mk("polymarket", "b", { title: "Lakers vs. Celtics", category: "sports", yesLabel: "Lakers", noLabel: "Celtics", closeTime: at(2026, 11, 6, 6), rules: "If the game is postponed, the market resolves 50-50." });
    const s = assessSafety(a, b, { inverted: false });
    expect(s.safety).toBe("yellow");
    expect(s.notes).toContain("Closes 6 hours apart");
    expect(s.notes).toContain("If the event is postponed or cancelled: Kalshi resolves No; Polymarket resolves 50-50");
  });
  it("RED: a tie is its own outcome, so buying both teams across venues is not a lock", () => {
    // From a live pair: Kalshi MIL first-5 YES with Polymarket TB first-5 YES, treated as inverted.
    const k = mk("kalshi", "KXMLBF5-MIL", { title: "Milwaukee first 5 innings winner", category: "sports", yesLabel: "Milwaukee",
      rules: 'If Milwaukee wins the first 5 innings of the Milwaukee vs Tampa Bay game, then the market resolves to Yes. If the score at the end of the first 5 innings is tied, the "Tie" strike will resolve to Yes and all team strikes will resolve to No.' });
    const p = mk("polymarket", "pm-tb", { title: "Tampa Bay Rays winning after 5 innings?", category: "sports", yesLabel: "Tampa Bay Rays",
      rules: 'This market will resolve to "Tampa Bay Rays" if the Tampa Bay Rays is winning the game at the conclusion of the 5th inning. If the game is tied at the conclusion of the 5th inning, this market will resolve to "Draw".' });
    const s = assessSafety(k, p, { inverted: true });
    expect(s.safety).toBe("red");
    expect(s.mismatch).toContain("tie");
    expect(s.notes.some(n => n.startsWith("A tie is its own outcome"))).toBe(true);
    // The same team on both venues loses together on a tie: no problem there.
    expect(assessSafety(k, { ...p, yesLabel: "Milwaukee Brewers" }, { inverted: false }).mismatch).not.toContain("tie");
  });
  it("tie clauses compare through the inversion", () => {
    const a = mk("kalshi", "a", { title: "Chiefs vs Bills", category: "sports", yesLabel: "Chiefs", rules: "If the game ends in a tie, the market resolves to No." });
    const same = mk("polymarket", "b", { title: "Bills vs. Chiefs", category: "sports", yesLabel: "Bills", noLabel: "Chiefs", rules: "If the game ends in a tie, the market resolves to Yes." });
    // Inverted: Polymarket YES (Bills) is Kalshi NO, so "tie → Yes" there equals "tie → No" here.
    expect(assessSafety(a, same, { inverted: true }).notes.some(n => n.startsWith("If it ends in a tie"))).toBe(false);
    expect(assessSafety(a, same, { inverted: false }).notes.some(n => n.startsWith("If it ends in a tie"))).toBe(true);
  });
  it("RED: different dates", () => {
    const a = mk("kalshi", "a", { title: "Will Bitcoin be above $100,000 on Nov 5, 2026?", category: "crypto" });
    const b = mk("polymarket", "b", { title: "Will Bitcoin be above $100,000 on November 6, 2026?", category: "crypto" });
    const s = assessSafety(a, b, { inverted: false });
    expect(s.safety).toBe("red");
    expect(s.notes[0]).toBe("Different dates: Kalshi Nov 5, 2026; Polymarket Nov 6, 2026");
    expect(s.mismatch).toContain("date");
  });
  it("RED: different thresholds, teams, or overtime rules that conflict", () => {
    const a = mk("kalshi", "a", { title: "Will Bitcoin be above $100,000 on Nov 5?" });
    const b = mk("polymarket", "b", { title: "Will Bitcoin be above $105,000 on Nov 5?" });
    expect(assessSafety(a, b, { inverted: false }).safety).toBe("red");
    const g1 = mk("kalshi", "g1", { title: "Lakers vs Celtics", category: "sports", rules: "Includes overtime." });
    const g2 = mk("polymarket", "g2", { title: "Lakers vs. Celtics", category: "sports", rules: "Regulation time only." });
    const s = assessSafety(g1, g2, { inverted: false });
    expect(s.safety).toBe("red");
    expect(s.notes).toContain("Kalshi counts overtime; Polymarket counts regulation time only");
    expect(assessSafety(g1, mk("polymarket", "g3", { title: "Knicks vs. Celtics", category: "sports" }), { inverted: false }).safety).toBe("red");
  });
  it("RED: a price measured at different times", () => {
    const a = { ...kBtc100 };
    const b = { ...pBtc100, title: "Will Bitcoin be above $100,000 on November 5?", rules: pBtc100.rules.replace("5:00 PM ET", "12:00 PM ET") };
    const s = assessSafety(a, b, { inverted: false });
    expect(s.safety).toBe("red");
    expect(s.notes.join(" ")).toMatch(/Measured at different times: Kalshi uses 5:00 PM ET, Polymarket uses 12:00 PM ET/);
    expect(s.mismatch).toContain("date");
  });
  it("merges the LLM's differences (and they make a GREEN pair YELLOW)", () => {
    const s = assessSafety(kNflKc, pNfl, { inverted: false, llmDifferences: ["Polymarket settles on the official box score", "  ", "Polymarket settles on the official box score"] });
    expect(s).toEqual({ safety: "yellow", notes: ["Polymarket settles on the official box score"], mismatch: [] });
  });
});
