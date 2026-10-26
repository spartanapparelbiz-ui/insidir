import { describe, expect, it } from "vitest";
import type { VMarket } from "@/lib/types";
import { DEFAULT_MATCH_CONFIG, buildProfile, findCandidates, matchConfigFromEnv, scorePair, decide } from "@/lib/matching/candidates";
import {
  KALSHI_ALL, POLY_ALL, at, kBtc100, kBtc102, kBtc105, kButtigieg, kFedCut25, kFedHold, kNbaBos, kNbaLal, kNewsom, kNflKc, kNhlDay2, kWx60, mk,
  pBtc100, pBtc100Noon, pBtc101, pBtc105, pButtigieg, pFedCut25, pFedCut50, pFedHold, pNba, pNbaRematch, pNewsom, pNfl, pNhlDay1, pVanceGop, pWx60, pWx62, pusNba,
} from "./fixtures/matching/markets";

const score = (a: VMarket, b: VMarket) => {
  const s = scorePair(buildProfile(a), buildProfile(b));
  return { ...s, decision: decide(s, DEFAULT_MATCH_CONFIG) };
};
const decisions = (as: readonly VMarket[], bs: readonly VMarket[]) =>
  new Map(findCandidates(as, bs).map(c => [`${c.a.id}|${c.b.id}`, c]));

describe("scorePair: accepted deterministically", () => {
  it("sports moneyline, same side", () => {
    const s = score(kNbaLal, pNba);
    expect(s.decision).toBe("accept");
    expect(s.orientation).toBe("same");
    expect(s.score).toBeGreaterThan(0.9);
  });
  it("sports moneyline, inverted (Kalshi's Boston market vs Polymarket's Lakers-YES market)", () => {
    const s = score(kNbaBos, pNba);
    expect(s.decision).toBe("accept");
    expect(s.orientation).toBe("inverted");
  });
  it("Polymarket US with the outcomes reversed", () => {
    expect(score(kNbaLal, pusNba).orientation).toBe("inverted");
    expect(score(kNbaBos, pusNba).orientation).toBe("same");
  });
  it("NFL by city vs by nickname", () => {
    expect(score(kNflKc, pNfl)).toMatchObject({ decision: "accept", orientation: "same" });
  });
  it("election winner per candidate", () => {
    expect(score(kNewsom, pNewsom)).toMatchObject({ decision: "accept", orientation: "same" });
    expect(score(kButtigieg, pButtigieg)).toMatchObject({ decision: "accept", orientation: "same" });
  });
  it("BTC above $100,000 (Kalshi's 99,999.99 strike) at the same time", () => {
    const s = score(kBtc100, pBtc100);
    expect(s.decision).toBe("accept");
    expect(s.reasons.join(" ")).toContain("same numbers");
  });
  it("weather threshold", () => {
    expect(score(kWx60, pWx60).decision).toBe("accept");
  });
});

describe("scorePair: never the same market", () => {
  it("near-but-different BTC strikes are rejected with a reason", () => {
    for (const [a, b] of [[kBtc100, pBtc105], [kBtc100, pBtc101], [kBtc102, pBtc100], [kBtc105, pBtc100]] as const) {
      const s = score(a, b);
      expect(s.decision).toBe("reject");
      expect(s.conflicts.join(" ")).toMatch(/different numbers/);
    }
  });
  it("same strike measured at a different time of day", () => {
    expect(score(kBtc100, pBtc100Noon).conflicts).toContain("different times of day");
  });
  it("only one title states the time: the rules' time decides", () => {
    const untimed = { ...pBtc100, id: "untimed", title: "Will Bitcoin be above $100,000 on November 5?" };
    expect(score(kBtc100, untimed).decision).toBe("accept"); // both rules say 5 PM ET
    const noon = { ...untimed, rules: untimed.rules.replace("5:00 PM ET", "12:00 PM ET") };
    expect(score(kBtc100, noon).conflicts).toContain("measured at different times of day");
  });
  it("weather strikes 60 vs 62", () => {
    expect(score(kWx60, pWx62).decision).toBe("reject");
  });
  it("different candidates in the same race, and a different party's race", () => {
    expect(score(kNewsom, pButtigieg).decision).toBe("reject");
    expect(score(kNewsom, pVanceGop).conflicts.join(" ")).toMatch(/democratic vs republican/);
  });
  it("Fed: cut vs hold, and a 25 bps cut vs a 50+ bps cut", () => {
    expect(score(kFedCut25, pFedHold).conflicts.join(" ")).toMatch(/cut vs hold/);
    expect(score(kFedHold, pFedCut25).decision).toBe("reject");
    expect(score(kFedCut25, pFedCut50).conflicts.join(" ")).toMatch(/different numbers/);
  });
  it("same teams on different dates", () => {
    // Consecutive days, no date in the titles: the rules' scheduled dates differ.
    expect(score(kNhlDay2, pNhlDay1).conflicts).toContain("the rules give different dates");
    // Dates in both titles.
    const a = mk("kalshi", "a", { title: "Lakers vs Celtics on Nov 5, 2026?", category: "sports", yesLabel: "Lakers", closeTime: at(2026, 11, 6) });
    const b = mk("polymarket", "b", { title: "Lakers vs. Celtics (Nov 6)", category: "sports", yesLabel: "Lakers", noLabel: "Celtics", closeTime: at(2026, 11, 6, 12) });
    expect(score(a, b).conflicts).toContain("different dates");
    // A week apart: outside the close-time window.
    expect(score(kNbaLal, pNbaRematch).conflicts.join(" ")).toMatch(/close times \d+ hours apart/);
  });
  it("a game vs a season-long market for one of its teams", () => {
    const fut = mk("polymarket", "f", { title: "Will the Lakers win the 2027 NBA Finals?", category: "sports", closeTime: kNbaLal.closeTime });
    expect(score(kNbaLal, fut).decision).toBe("reject");
  });
  it("a moneyline vs a total on the same game", () => {
    const total = mk("polymarket", "t", { title: "Lakers vs. Celtics: O/U 220.5", yesLabel: "Over", noLabel: "Under", category: "sports", closeTime: pNba.closeTime });
    expect(score(kNbaLal, total).conflicts.join(" ")).toMatch(/different market types|different numbers|only one/);
    expect(score(kNbaLal, total).decision).toBe("reject");
  });
  it("different quoted words in mention markets", () => {
    const a = mk("kalshi", "a", { title: "Will Trump say 'tariff' during the Nov 4 rally?" });
    const b = mk("polymarket", "b", { title: "Will Trump say 'crypto' during the Nov 4 rally?" });
    expect(score(a, b).decision).toBe("reject");
  });
});

describe("orientation from label words", () => {
  it("soccer outcome markets: the label's team before the win verb is the same side", () => {
    const k = mk("kalshi", "k", { title: "Liverpool vs Arsenal Winner?", yesLabel: "Liverpool", noLabel: "Liverpool", category: "sports", rules: "Match scheduled for Nov 7, 2026." });
    const same = mk("polymarket", "p1", { title: "Will Liverpool beat Arsenal on November 7?", category: "sports", rules: "Match scheduled for November 7, 2026." });
    const other = mk("polymarket", "p2", { title: "Will Arsenal beat Liverpool on November 7?", category: "sports", rules: "Match scheduled for November 7, 2026." });
    expect(score(k, same).orientation).toBe("same");
    expect(score(k, other).orientation).toBe("unknown");
    expect(score(k, other).decision).not.toBe("accept");
  });
  it("a one-word surname label in politics", () => {
    const k = mk("kalshi", "k", { title: "Who will win the 2027 Kentucky governor race?", yesLabel: "Halvorsen", noLabel: "Halvorsen", category: "politics", closeTime: at(2027, 11, 3) });
    const p = mk("polymarket", "p", { title: "Will Erik Halvorsen win the 2027 Kentucky governor race?", category: "politics", closeTime: at(2027, 11, 3) });
    const s = score(k, p);
    expect(s.orientation).toBe("same");
    expect(s.decision).toBe("accept");
  });
});

describe("scorePair: unsure → LLM band", () => {
  it("Fed cut with differently worded titles", () => {
    const s = score(kFedCut25, pFedCut25);
    expect(s.decision).toBe("llm");
    expect(s.conflicts).toEqual([]);
  });
  it("same subject, unrelated questions stay out of the deterministic band", () => {
    const a = mk("kalshi", "a", { title: "Will Trump attend the Army-Navy game in 2026?", category: "politics" });
    const b = mk("polymarket", "b", { title: "Will Trump visit China in 2026?", category: "politics" });
    expect(score(a, b).decision).not.toBe("accept");
  });
  it("a missing number on one side caps the score below accept", () => {
    const a = mk("kalshi", "a", { title: "Will Bitcoin hit a new all-time high in 2026?", category: "crypto" });
    const b = mk("polymarket", "b", { title: "Will Bitcoin reach $150,000 in 2026?", category: "crypto" });
    expect(score(a, b).decision).not.toBe("accept");
  });
});

describe("findCandidates", () => {
  it("pairs the fixture set as expected and nothing else is accepted", () => {
    const cands = findCandidates(KALSHI_ALL, POLY_ALL);
    const accepted = cands.filter(c => c.decision === "accept").map(c => `${c.a.id}|${c.b.id}|${c.orientation}`).sort();
    expect(accepted).toEqual(
      [
        `${kNbaLal.id}|${pNba.id}|same`,
        `${kNbaBos.id}|${pNba.id}|inverted`,
        `${kNflKc.id}|${pNfl.id}|same`,
        `${kNewsom.id}|${pNewsom.id}|same`,
        `${kButtigieg.id}|${pButtigieg.id}|same`,
        `${kBtc100.id}|${pBtc100.id}|same`,
        `${kBtc105.id}|${pBtc105.id}|same`,
        `${kWx60.id}|${pWx60.id}|same`,
      ].sort(),
    );
    const d = decisions(KALSHI_ALL, POLY_ALL);
    expect(d.get(`${kFedCut25.id}|${pFedCut25.id}`)?.decision).toBe("llm");
    expect(d.get(`${kFedHold.id}|${pFedHold.id}`)?.decision).toBe("llm");
    // Never blocked together at all: different strike keys / outside the window.
    expect(d.has(`${kBtc102.id}|${pBtc101.id}`)).toBe(false);
    expect(d.has(`${kNbaLal.id}|${pNbaRematch.id}`)).toBe(false);
  });
  it("respects MATCH_* env config", () => {
    const cfg = matchConfigFromEnv({ MATCH_MAX_CLOSE_GAP_HOURS: "1", MATCH_AUTO_ACCEPT: "0.99", MATCH_LLM_MIN: "bogus" });
    expect(cfg).toMatchObject({ maxCloseGapHours: 1, autoAccept: 0.99, llmMin: DEFAULT_MATCH_CONFIG.llmMin });
    // The NBA markets close 2.5h apart: a 1h window drops them.
    expect(findCandidates([kNbaLal], [pNba], cfg)).toEqual([]);
  });
  it("scales: 5k × 10k synthetic markets in well under a minute, without pairing different strikes", () => {
    const H = 3_600_000;
    const base = at(2026, 11, 1);
    const ks: VMarket[] = [];
    const ps: VMarket[] = [];
    // BTC ladders: 30 days × 50 strikes on Kalshi, 30 days × 20 strikes on Polymarket.
    for (let d = 0; d < 30; d++) {
      const close = base + d * 24 * H + 22 * H;
      const day = new Date(close).toISOString().slice(0, 10);
      for (let s = 0; s < 50; s++) {
        const v = 90000 + s * 500;
        ks.push(mk("kalshi", `K-BTC-${day}-${v}`, { title: `Bitcoin price on ${day} at 5pm EST?`, yesLabel: `$${v.toLocaleString("en-US")} or above`, category: "crypto", closeTime: close, strike: { kind: "above", value: v - 0.01, upper: null, subject: "btc" } }));
      }
      for (let s = 0; s < 20; s++) {
        const v = 90000 + s * 1000;
        ps.push(mk("polymarket", `P-BTC-${day}-${v}`, { title: `Will Bitcoin be above $${v.toLocaleString("en-US")} on ${day} at 5pm ET?`, category: "crypto", closeTime: close }));
      }
    }
    // Generic noise: people and topics spread over time.
    const people = ["Trump", "Newsom", "Musk", "Powell", "Vance", "Harris", "Rubio", "Putin"];
    const topics = ["visit China", "tweet about Bitcoin", "attend the summit", "sign the bill", "meet the Pope", "announce a run", "speak at the UN", "appear on TV"];
    for (let i = ks.length; i < 5000; i++) {
      ks.push(mk("kalshi", `K-${i}`, { title: `Will ${people[i % 8]} ${topics[(i >> 3) % 8]} by week ${i % 40}?`, category: "politics", closeTime: base + (i % 200) * 6 * H }));
    }
    for (let i = ps.length; i < 10000; i++) {
      ps.push(mk("polymarket", `P-${i}`, { title: `Will ${people[i % 8]} ${topics[(i >> 3) % 8]} before round ${i % 50}?`, category: "politics", closeTime: base + (i % 300) * 4 * H }));
    }
    const t0 = performance.now();
    const cands = findCandidates(ks, ps);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(60_000);
    expect(cands.length).toBeLessThanOrEqual(5000 * DEFAULT_MATCH_CONFIG.maxCandidatesPerMarket);
    for (const c of cands.filter(x => x.decision === "accept" && x.a.id.startsWith("K-BTC"))) {
      // Kalshi 90,500 (strike 90,499.99) must only ever meet Polymarket 90,500 — which does not exist.
      const kv = Number(c.a.id.split("-").pop());
      const pv = Number(c.b.id.split("-").pop());
      expect(kv).toBe(pv);
      expect(c.a.id.slice(6, 16)).toBe(c.b.id.slice(6, 16));
    }
    expect(cands.filter(x => x.decision === "accept" && x.a.id.startsWith("K-BTC")).length).toBe(30 * 20); // every Polymarket strike has its Kalshi twin
  }, 120_000);
});
