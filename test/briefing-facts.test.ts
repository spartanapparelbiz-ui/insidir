import { describe, expect, it } from "vitest";
import { costLine, costSection, etDeadline, gammaRules, gammaWinner, historySection, holdingLine, ladderFor, NO_LADDERS, parseLeg, playingFree, playingSection, priceCompareSection, READ_FREE, readSection, rulesSection, SECTION_KEYS, SECTION_TITLES, slugOfUrl, timingFree, timingSection, whoFree, whoSection, type Holding } from "@/lib/briefing/facts";
import { gateBriefing } from "@/lib/briefing/gate";
import { positionHash, stillGood, type Briefing } from "@/lib/briefing/store";
import type { WalletFacts } from "@/lib/briefing/wallets";
import { lineProblems } from "@/lib/briefing/write";
import { numbersIn } from "@/lib/analyst/validate";

const H = 3_600_000, DAY = 24 * H;
const NOW = Date.UTC(2026, 10, 9, 17); // Monday noon ET
const labels = { yes: "Colts", no: "Cowboys" };
const W1 = "0x7c3db723f1d4d8cb9c55009520aaaaaaaaaa5c6b", W2 = "0xab12000000000000000000000000000000009f00";

describe("1. what you're actually betting on", () => {
  const g = { description: "This market will resolve to \"Yes\" if the House votes to impeach.\n\nThe Senate doesn't need to convict. If he leaves office first, this market resolves to \"No\". Extra text here.", endDate: "2026-12-31T17:00:00Z", resolutionSource: "https://www.congress.gov/" };
  it("takes the rules' first sentences, then the deadline (ET) and the source; keeps the full text as a fact", () => {
    const r = rulesSection(g);
    expect(r.lines).toEqual([
      "This market will resolve to \"Yes\" if the House votes to impeach.",
      "The Senate doesn't need to convict.",
      "If he leaves office first, this market resolves to \"No\".",
      "Deadline: December 31, 2026 at 12:00 PM ET. Resolves from congress.gov.",
    ]);
    expect(r.notes[0]).toBe(g.description);
    expect(etDeadline(Date.parse("2026-12-31T17:00:00Z"))).toBe("December 31, 2026 at 12:00 PM ET");
  });
  it("says so when the rules can't be read, and leaves out a missing source", () => {
    expect(rulesSection(null).lines).toEqual(["Polymarket's rules for this market couldn't be read just now."]);
    expect(rulesSection({ ...g, resolutionSource: "None" }).lines.at(-1)).toBe("Deadline: December 31, 2026 at 12:00 PM ET. It resolves from the sources the rules name.");
  });
  it("reads the rules from Polymarket by slug, trying closed markets too, and finds a settled winner", async () => {
    const calls: string[] = [];
    const f = (async (u: string) => {
      calls.push(u);
      const closed = u.includes("closed=true");
      return { ok: true, json: async () => (closed ? [{ description: "Rules.", endDate: null, resolutionSource: "", conditionId: "0xabc", closed: true, outcomePrices: "[\"1\", \"0\"]", clobTokenIds: "[\"111\", \"222\"]" }] : []) };
    }) as unknown as typeof fetch;
    const r = await gammaRules(`test-slug-${Math.random()}`, f);
    expect(calls).toHaveLength(2);
    expect(r).toMatchObject({ description: "Rules.", conditionId: "0xabc", closed: true, yes: 1, yesToken: "111" });
    expect(gammaWinner(r)).toBe("yes");
    expect(gammaWinner({ closed: false, yes: 1 })).toBeNull();
    expect(slugOfUrl("https://polymarket.com/event/nfl-dal-ind-2026-11-08/nfl-dal-ind-2026-11-08-spread-home-4pt5")).toBe("nfl-dal-ind-2026-11-08-spread-home-4pt5");
    expect(slugOfUrl("https://polymarket.com/event/iran-leader-end-of-2026")).toBe("iran-leader-end-of-2026");
  });
});

describe("2. what it costs and what it pays", () => {
  it("per $100, both sides, the asked side first, and the viewer's own position", () => {
    expect(costLine(0.76, "Yes")).toBe("76¢ means the market says 76% for Yes. $100 on Yes buys 131 shares. They pay $131 if it resolves Yes, $0 if not.");
    expect(costLine(0.08, "Cowboys")).toBe("8¢ means the market says 8% for Cowboys. $100 on Cowboys buys 1,250 shares. They pay $1,250 if Cowboys wins, $0 if not.");
    const c = costSection(0.6, labels, "no", null, { side: "no", price: 0.25, amount: 100 });
    expect(c[0]).toMatch(/^40¢ means the market says 40% for Cowboys/);
    expect(c[2]).toBe("Your $100 on Cowboys at 25¢ is 400 shares, worth $160 now (+$60).");
    expect(costSection(null, labels, null, null)).toEqual(["There's no price on Polymarket for this market right now."]);
    expect(costSection(0.5, labels, null, "no")).toEqual(["This market has settled: Cowboys won. Each Cowboys share paid $1."]);
  });
});

describe("3. how we got here", () => {
  it("the price 1, 7 and 30 days ago and the biggest moves with their windows, never why", () => {
    const pts = Array.from({ length: 40 * 24 }, (_, i) => ({ t: NOW - 40 * DAY + i * H, p: 0.24 }));
    // Thursday Nov 5, 6 p.m. to midnight ET: 24% → 40%.
    const start = Date.UTC(2026, 10, 5, 23), end = Date.UTC(2026, 10, 6, 5);
    for (const p of pts) if (p.t > start) p.p = p.t >= end ? 0.4 : 0.24 + 0.16 * ((p.t - start) / (end - start));
    const lines = historySection(pts, 0.4, "Yes", NOW);
    expect(lines[0]).toBe("Yes is at 40% now: 1 day ago 40%, 7 days ago 24%, 30 days ago 24%.");
    expect(lines[1]).toBe("Biggest moves: 24% → 40% Thursday 6 p.m.–midnight.");
    expect(lines.join(" ")).not.toMatch(/because|due to|after news/i);
    expect(historySection([], null, "Yes", NOW)).toEqual(["There's no price history for this market yet."]);
  });
});

describe("4. who's on each side", () => {
  const facts = new Map<string, WalletFacts>([[W1, { wallet: W1, short: "0x7c3d…5c6b", tier: "millionaire", record: { n: 20, won: 14, lost: 6, net: 880, line: "14–6, $100 on each: +$880" }, usualBet: 15_000 }]]);
  const holdings: Holding[] = [
    { wallet: W1, tier: "millionaire", side: "yes", dollars: 48_000, price: 0.62 },
    { wallet: W2, tier: "pro", side: "no", dollars: 9_000, price: 0.4 },
  ];
  it("money and wallets per side; top wallets by tier and short address only, their record and size", () => {
    const lines = whoSection(labels, { yes: { dollars: 48_000, wallets: 1 }, no: { dollars: 0, wallets: 0 } }, holdings, facts, "Football");
    expect(lines[0]).toBe("Colts: 1 $1M+ wallet, $48K. Cowboys: 0 $1M+ wallets, $0.");
    expect(lines[1]).toBe("On Colts: Millionaire 0x7c3d…5c6b: $48K at 62¢. 14–6 on Football, $100 on each: +$880. 3.2× their usual bet.");
    expect(lines[2]).toBe("On Cowboys: Pro 0xab12…9f00: $9K at 40¢. No settled Football bets yet.");
    for (const l of lines) expect(l).not.toMatch(/0x[0-9a-f]{10,}/i);
    // Without its facts, a wallet is still only its tier and short address.
    expect(holdingLine(holdings[0]!, undefined, "Football")).toBe("Millionaire 0x7c3d…5c6b: $48K at 62¢. No settled Football bets yet.");
  });
  it("visitors get the total only, no side", () => {
    expect(whoFree({ yes: { dollars: 48_000, wallets: 1 }, no: { dollars: 2_000, wallets: 1 } })).toBe("$50K from proven $1M+ wallets (2 positions). Members see which side it is on.");
  });
});

describe("5. how they're playing it", () => {
  it("reads spread, total, moneyline and three-way titles; never guesses one it can't read", () => {
    expect(parseLeg("Spread: Cowboys (-4.5)", "no", "Cowboys", "Colts")).toEqual({ kind: "margin", team: "Cowboys", other: "Colts", line: 4.5, dir: "under" });
    expect(parseLeg("Cowboys vs. Colts: O/U 50.5", "yes", "Over", "Under")).toEqual({ kind: "total", line: 50.5, dir: "over" });
    expect(parseLeg("Cowboys vs. Colts", "no", "Cowboys", "Colts")).toEqual({ kind: "margin", team: "Cowboys", other: "Colts", line: 0, dir: "under" });
    expect(parseLeg("Will Aston Villa FC win on 2026-11-08?", "yes", "Yes", "No")).toEqual({ kind: "outcome", outcome: "Aston Villa FC", side: "yes" });
    expect(parseLeg("Will Manchester United FC vs. Aston Villa FC end in a draw?", "no", "Yes", "No")).toEqual({ kind: "outcome", outcome: "Draw", side: "no" });
    expect(parseLeg("Will the Fed cut rates in December?", "yes", "Yes", "No")).toBeNull();
  });
  it("a wallet's spread ladder: profit or loss per margin, from the first team's side", () => {
    const line = ladderFor("Millionaire 0xf031…c80c", [
      { title: "Spread: Cowboys (-4.5)", side: "no", yesLabel: "Cowboys", noLabel: "Colts", dollars: 100_000, price: 0.5 },
      { title: "Spread: Cowboys (-5.5)", side: "no", yesLabel: "Cowboys", noLabel: "Colts", dollars: 100_000, price: 0.5 },
      { title: "Cowboys vs. Colts", side: "no", yesLabel: "Cowboys", noLabel: "Colts", dollars: 41_000, price: 0.41 },
    ]);
    // Cowboys lose: all three win (+100K +100K +59K); win by 1–4: the spreads win, the moneyline loses; exactly 5: only −5.5 wins.
    expect(line).toBe("Millionaire 0xf031…c80c: $241K across 3 Cowboys lines. Cowboys lose by 1+: +$259K. Cowboys win by 1–4: +$159K. Cowboys win by exactly 5: −$41K. Cowboys win by 6+: −$241K.");
  });
  it("totals and three-way results; one leg isn't a ladder", () => {
    expect(ladderFor("Pro 0xab12…9f00", [
      { title: "Bengals vs. Falcons: O/U 54.5", side: "yes", yesLabel: "Over", noLabel: "Under", dollars: 10_000, price: 0.5 },
      { title: "Bengals vs. Falcons: O/U 58.5", side: "no", yesLabel: "Over", noLabel: "Under", dollars: 10_000, price: 0.5 },
    ])).toBe("Pro 0xab12…9f00: $20K across 2 total lines. Total 54 or less: $0. Total 55–58: +$20K. Total 59+: $0.");
    expect(ladderFor("Pro 0xab12…9f00", [
      { title: "Will Aston Villa FC win on 2026-11-08?", side: "no", yesLabel: "Yes", noLabel: "No", dollars: 6_000, price: 0.6 },
      { title: "Will Manchester United FC win on 2026-11-08?", side: "yes", yesLabel: "Yes", noLabel: "No", dollars: 4_000, price: 0.4 },
    ])).toBe("Pro 0xab12…9f00: $10K across 2 result markets. Aston Villa FC: −$10K. Manchester United FC: +$10K. Draw: $0.");
    expect(ladderFor("x", [{ title: "Spread: Cowboys (-4.5)", side: "no", yesLabel: "Cowboys", noLabel: "Colts", dollars: 1, price: 0.5 }])).toBeNull();
    expect(playingSection([null])).toEqual([NO_LADDERS]);
    expect(playingFree(0)).toBe(NO_LADDERS);
    expect(playingFree(2)).not.toMatch(/Colts|Cowboys|yes|no\b/i);
  });
});

describe("6. early or late money", () => {
  it("most of a side's money came in under a price, against the price now; visitors get only when", () => {
    const e = { yes: [{ price: 0.2, amount: 300, at: NOW - 3 * DAY }, { price: 0.7, amount: 100, at: NOW - DAY }], no: [] };
    expect(timingSection(e, 0.76, { yes: "Yes", no: "No" })).toEqual(["Most of the YES money came in under 25¢. You'd be buying at 76¢."]);
    expect(timingSection({ yes: [], no: [] }, 0.5, labels)).toEqual(["No $1M+ money has come in on this market yet."]);
    expect(timingFree(e)).toBe("The $1M+ money came in between Nov 6 and Nov 8. Members see what price it got against the price now.");
  });
});

describe("7. better price", () => {
  it("Kalshi against Polymarket per side, or says Kalshi doesn't list it", () => {
    expect(priceCompareSection(0.76, { yes: 0.74, yesAsk: 0.74, noAsk: 0.27 }, labels)).toEqual([
      "Colts: Polymarket 76¢, Kalshi 74¢ to buy. Kalshi is 2¢ cheaper.",
      "Cowboys: Polymarket 24¢, Kalshi 27¢ to buy. Polymarket is 3¢ cheaper.",
    ]);
    expect(priceCompareSection(0.5, null, labels)).toEqual(["Kalshi doesn't list this market."]);
  });
});

describe("8. the honest read", () => {
  it("the case for each side and what the money says, from the facts only, never advice", () => {
    const lines = readSection(labels, { yes: { dollars: 300_000, wallets: 2 }, no: { dollars: 100_000, wallets: 1 } },
      { yes: { name: "Millionaire 0x7c3d…5c6b", record: "14–6 on Football" }, no: null }, 0.76);
    expect(lines).toEqual([
      "The case for Colts: 2 $1M+ wallets hold $300K on it, the biggest Millionaire 0x7c3d…5c6b (14–6 on Football).",
      "The case for Cowboys: 1 $1M+ wallet holds $100K on it.",
      "What the money says: 75% of the $1M+ money ($300K of $400K) is on Colts, priced at 76¢.",
    ]);
    const allowed = new Set(numbersIn(lines.join(" ")));
    for (const l of lines) expect(lineProblems(l, allowed)).toEqual([]);
  });
});

describe("the paywall and the cache", () => {
  const b: Briefing = {
    marketId: "m", title: "Colts vs. Cowboys", labels, side: "yes", price: 0.76, result: null, origin: "template", createdAt: NOW,
    sections: SECTION_KEYS.map(k => ({ key: k, title: SECTION_TITLES[k], lines: [`${k} first, Colts`, `${k} second`] })),
    free: { who: "free who", playing: "free playing", timing: "free timing", read: "free read" },
  };
  it("members get every line; visitors one line per section, side-neutral until it settles, and never a side", () => {
    expect(gateBriefing(b, true).sections.every(s => s.lines.length === 2)).toBe(true);
    const v = gateBriefing(b, false);
    expect(v.locked).toBe(true);
    expect(v.side).toBeNull();
    expect(v.sections.map(s => s.lines)).toEqual([["rules first, Colts"], ["cost first, Colts"], ["history first, Colts"], ["free who"], ["free playing"], ["free timing"], ["price_compare first, Colts"], ["free read"]]);
    expect(JSON.stringify(v)).not.toMatch(/second|who first|read first/);
    expect(gateBriefing({ ...b, result: "yes" }, false).sections.find(s => s.key === "who")!.lines).toEqual(["who first, Colts"]);
    expect(READ_FREE).not.toMatch(/Colts|Cowboys/);
  });
  it("rebuilds when positions change, the result comes in, or the price moves 3¢", () => {
    const h = positionHash([{ wallet: W1, side: "yes", dollars: 48_000 }]);
    expect(positionHash([{ wallet: W1, side: "yes", dollars: 49_000 }])).not.toBe(h);
    expect(positionHash([{ wallet: W1, side: "yes", dollars: 48_000 }], null, "yes")).not.toBe(h);
    expect(stillGood({ positionHash: h, price: 0.76 }, h, 0.78)).toBe(true);
    expect(stillGood({ positionHash: h, price: 0.76 }, h, 0.79)).toBe(false);
    expect(stillGood({ positionHash: h, price: 0.76 }, "other", 0.76)).toBe(false);
  });
  it("no banned words in any template", () => {
    const text = [costLine(0.5, "Yes"), whoFree({ yes: { dollars: 1, wallets: 1 }, no: { dollars: 0, wallets: 0 } }), READ_FREE, NO_LADDERS, playingFree(2), ...Object.values(SECTION_TITLES)].join(" ");
    expect(text).not.toMatch(/\b(check|signal|win rate|instantly|should)\b/i);
  });
});
