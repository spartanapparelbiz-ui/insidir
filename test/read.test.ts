/* The Read, the pure parts: the proven-money split, unusual flags (never "insider"), the best price per side and the US
 * rule (Kalshi only), matching typed words to markets (one clear winner, else 3 choices), and the analyst line: facts,
 * the template, and the validator (one sentence, only the facts' numbers and names, no advice, no promises). */
import { describe, expect, it } from "vitest";
import { validateLine, writeLine } from "@/lib/read/line";
import { bigSplitOf, choose, pmProven, pricesFor, provenFrom, provenSplit, readFacts, readHasMoney, sidePrices, signedPct, signedUsd, templateLine, textScore, UNUSUAL_TEXT, unusualOf } from "@/lib/read/math";

describe("proven money", () => {
  it("splits proven wallets' dollars by side; a wallet on both sides counts once", () => {
    const p = provenSplit([{ wallet: "a", side: "yes", dollars: 60_000 }, { wallet: "b", side: "yes", dollars: 20_000 }, { wallet: "a", side: "no", dollars: 5_000 }, { wallet: "c", side: "no", dollars: 15_000 }, { wallet: "d", side: "no", dollars: 0 }]);
    expect(p).toEqual({ yes: { dollars: 80_000, wallets: 2 }, no: { dollars: 20_000, wallets: 2 }, wallets: 3, yesShare: 0.8 });
    expect(provenSplit([]).yesShare).toBeNull();
  });
});

describe("unusual bets", () => {
  it("a fresh wallet, big for the market's day, or the long-shot side; the words never say insider", () => {
    expect(unusualOf({ amount: 50_000, price: 0.1, newWallet: true }, 100_000)).toEqual({ unusual: ["fresh_wallet", "big_for_market", "long_shot"], ofVolume: 0.5 });
    expect(unusualOf({ amount: 10_000, price: 0.6 }, 1_000_000)).toEqual({ unusual: [], ofVolume: 0.01 });
    expect(unusualOf({ amount: 10_000, price: 0.6 }, null)).toEqual({ unusual: [], ofVolume: null });
    for (const t of Object.values(UNUSUAL_TEXT)) expect(t).not.toMatch(/insider/i);
  });
});

describe("prices", () => {
  it("each side on each venue, the cheaper one best; in the US Kalshi only", () => {
    const p = sidePrices(0.62, 0.6);
    expect(p.yes).toEqual({ polymarket: 0.62, kalshi: 0.6, best: "kalshi" });
    expect(p.no.best).toBe("polymarket");
    expect(p.no.polymarket).toBeCloseTo(0.38, 9);
    expect(sidePrices(null, 0.4).yes).toEqual({ polymarket: null, kalshi: 0.4, best: "kalshi" });
    expect(sidePrices(null, null).yes.best).toBeNull();
    const us = pricesFor(p, true);
    expect(us.yes).toEqual({ polymarket: null, kalshi: 0.6, best: "kalshi" });
    expect(us.no).toEqual({ polymarket: null, kalshi: 0.4, best: "kalshi" });
    expect(pricesFor(sidePrices(0.5, null), true).yes).toEqual({ polymarket: null, kalshi: null, best: null });
  });
});

describe("matching typed words", () => {
  it("scores the share of words found", () => {
    expect(textScore("Senate control", "Which party will control the Senate after 2026?", null)).toBe(1);
    expect(textScore("Lakers tonight", "Lakers vs. Celtics", "NBA")).toBe(1);
    expect(textScore("Senate control", "Fed rate cut in December?", null)).toBe(0);
  });
  it("one clear winner is read; close ones become up to 3 choices; nothing found says so", () => {
    const c = (id: string, score: number, volume = 0) => ({ key: `p:${id}`, venue: "polymarket" as const, id, title: id, event: null, yesPrice: null, score, volume });
    expect(choose([c("a", 1), c("b", 0.5)])).toEqual({ kind: "market", venue: "polymarket", id: "a" });
    const r = choose([c("a", 1, 5), c("b", 1, 9), c("c", 1, 1), c("d", 1, 0)]);
    expect(r.kind).toBe("choices");
    expect(r.kind === "choices" && r.list.map(x => x.id)).toEqual(["b", "a", "c"]);
    expect(choose([c("a", 0.2)]).kind).toBe("none");
    expect(choose([c("a", 0.8), { ...c("a", 0.8), id: "a" }]).kind).toBe("market");
  });
});

const read = {
  key: "p:0xabc", yesLabel: "Chiefs", noLabel: "Bills", at: 0,
  proven: provenSplit([{ wallet: "a", side: "yes", dollars: 64_000 }, { wallet: "b", side: "no", dollars: 36_000 }]),
  bets: [{ venue: "polymarket" as const, side: "yes" as const, amount: 412_000, price: 0.62, at: 0, wallet: "0x4f…c2", unusual: ["big_for_market" as const], ofVolume: 0.3 }],
  prices: sidePrices(0.62, 0.6),
};

describe("proven money from winning trackers and proven wallets", () => {
  const short = (w: string) => `${w.slice(0, 4)}…`;
  const T = new Map([["underdog-hunters", { name: "Long Shots", returnPct: 0.189, settled: 493 }]]);
  it("trackers show which side their open positions are on, with their record; Kalshi trades count through trackers", () => {
    const p = provenFrom({ short, trackers: T, records: new Map(), follow: new Map(), walletOpen: [], positions: [
      { id: "k1", venue: "kalshi", wallet: null, side: "yes", dollars: 50_000, trackers: ["underdog-hunters"] },
      { id: "p1", venue: "polymarket", wallet: "0xnobody", side: "no", dollars: 20_000, trackers: ["underdog-hunters", "favorites-only"] },
      { id: "p2", venue: "polymarket", wallet: "0xother", side: "no", dollars: 90_000, trackers: ["favorites-only"] },
    ] });
    expect(p.trackers).toEqual([{ slug: "underdog-hunters", name: "Long Shots", returnPct: 0.189, settled: 493, sides: [{ side: "yes", dollars: 50_000, positions: 1 }, { side: "no", dollars: 20_000, positions: 1 }] }]);
    // Only positions in a winning tracker count; nobody here is a proven wallet.
    expect([p.yes.dollars, p.no.dollars, p.wallets, p.walletRows]).toEqual([50_000, 20_000, 0, []]);
    expect(p.yesShare).toBeCloseTo(50 / 70, 9);
  });
  it("a wallet is proven at 30+ closed Polymarket markets and positive all-time profit, or a winning followable record", () => {
    expect(pmProven({ closed: 30, profit: 1 })).toBe(true);
    expect(pmProven({ closed: 29, profit: 1e6 })).toBe(false);
    expect(pmProven({ closed: 300, profit: 0 })).toBe(false);
    const p = provenFrom({ short, trackers: new Map(), positions: [
      { id: "a", venue: "polymarket", wallet: "0xrec", side: "yes", dollars: 30_000, trackers: [] },
      { id: "b", venue: "polymarket", wallet: "0xrec", side: "yes", dollars: 10_000, trackers: [] },
      { id: "c", venue: "polymarket", wallet: "0xfol", side: "no", dollars: 5_000, trackers: [] },
      { id: "d", venue: "polymarket", wallet: "0xlose", side: "no", dollars: 80_000, trackers: [] },
    ],
      // Polymarket says 0xrec holds $55K: the larger of the two counts, once.
      walletOpen: [{ wallet: "0xrec", side: "yes", dollars: 55_000 }],
      records: new Map([["0xrec", { closed: 41, profit: 52_340.4 }], ["0xlose", { closed: 90, profit: -10 }]]),
      follow: new Map([["0xfol", { returnPct: 0.12, settled: 31, winner: true }], ["0xrec", { returnPct: -0.05, settled: 30, winner: false }]]) });
    expect(p.walletRows).toEqual([
      { wallet: "0xre…", side: "yes", dollars: 55_000, profit: 52_340, closed: 41, follow: { returnPct: -0.05, settled: 30 } },
      { wallet: "0xfo…", side: "no", dollars: 5_000, profit: null, closed: null, follow: { returnPct: 0.12, settled: 31 } },
    ]);
    expect([p.yes.dollars, p.no.dollars, p.wallets]).toEqual([55_000, 5_000, 2]);
  });
  it("the big-money split counts every open tracked position; a Read with neither proven money nor big bets has nothing", () => {
    const b = bigSplitOf([{ id: "a", venue: "kalshi", wallet: null, side: "no", dollars: 25_000, trackers: [] }, { id: "b", venue: "polymarket", wallet: "0x1", side: "yes", dollars: 75_000, trackers: [] }]);
    expect(b).toEqual({ yes: { dollars: 75_000, positions: 1 }, no: { dollars: 25_000, positions: 1 }, yesShare: 0.75 });
    const empty = provenFrom({ short, trackers: T, records: new Map(), follow: new Map(), walletOpen: [], positions: [] });
    expect(readHasMoney({ proven: empty, bets: [], big: bigSplitOf([]) })).toBe(false);
    expect(readHasMoney({ proven: empty, bets: [], big: b })).toBe(true);
  });
  it("the tracker fact and its line pass the validator", () => {
    const proven = provenFrom({ short, trackers: T, records: new Map(), follow: new Map(), walletOpen: [], positions: [{ id: "k1", venue: "kalshi", wallet: null, side: "yes", dollars: 50_000, trackers: ["underdog-hunters"] }] });
    const f = readFacts({ ...read, proven });
    expect(f.facts.map(x => x.text)).toContain("Long Shots (+18.9% over 493 settled) is on Chiefs");
    expect(f.facts.map(x => x.text)).toContain("$50K of proven money from 1 winning tracker");
    expect(validateLine("Long Shots (+18.9% over 493 settled) is on Chiefs, and 100% of proven money is on Chiefs.", f).ok).toBe(true);
    expect(signedPct(-0.042)).toBe("−4.2%");
    expect(signedUsd(52_340)).toBe("+$52.3K");
  });
});

describe("the analyst line", () => {
  it("facts are exact texts; the template is one sentence that passes the validator", () => {
    const f = readFacts(read);
    expect(f.facts.map(x => x.text)).toEqual([
      "64% of proven money is on Chiefs", "$100K of proven money from 2 proven wallets", "1 big bet in the last 24 hours, $412K in all",
      "the largest is $412K on Chiefs at 62¢", "1 flagged unusual", "Chiefs costs 60¢ on Kalshi and 62¢ on Polymarket", "Bills costs 40¢ on Kalshi and 38¢ on Polymarket",
    ]);
    const t = templateLine(f);
    expect(t).toBe("64% of proven money is on Chiefs; the largest is $412K on Chiefs at 62¢.");
    expect(validateLine(t, f).ok).toBe(true);
  });
  it("rejects advice, promises, invented numbers, names and a second sentence", () => {
    const f = readFacts(read);
    for (const bad of ["You should take the Chiefs at 60¢.", "64% of proven money is on Chiefs, a guaranteed winner.", "71% of proven money is on Chiefs.",
      "Patrick Mahomes's backers hold 64% of proven money.", "64% of proven money is on Chiefs. The largest is $412K."]) expect(validateLine(bad, f).ok, bad).toBe(false);
  });
  it("the analyst output never says guaranteed, risk-free, easy money, lock or sure thing", () => {
    const f = readFacts(read);
    for (const bad of ["64% of proven money is on Chiefs, guaranteed.", "64% of proven money is on Chiefs, risk-free.", "64% of proven money is on Chiefs, easy money.",
      "64% of proven money is on Chiefs, a lock.", "64% of proven money is on Chiefs, a sure thing."]) expect(validateLine(bad, f).ok, bad).toBe(false);
  });
  it("a model line that passes is used; one that fails twice, a capped member, or no key gets the template", async () => {
    const f = readFacts(read);
    const reply = (text: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { cost: 0.001 }, model: "m" }))) as unknown as typeof fetch;
    const prev = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-test";
    try {
      const ok = await writeLine(f, { allowModel: true, f: reply("64% of proven money is on Chiefs, and the largest is $412K on Chiefs at 62¢.") });
      expect(ok).toMatchObject({ origin: "model", text: "64% of proven money is on Chiefs, and the largest is $412K on Chiefs at 62¢." });
      expect(ok.costUsd).toBeGreaterThan(0);
      const bad = await writeLine(f, { allowModel: true, f: reply("Take the Chiefs, it is a lock.") });
      expect(bad).toMatchObject({ origin: "template", model: "template", text: templateLine(f) });
      expect(await writeLine(f, { allowModel: false })).toMatchObject({ origin: "template", model: "template-capped", costUsd: 0 });
    } finally { process.env.OPENROUTER_API_KEY = prev; }
  });
});
