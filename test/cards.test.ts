/* Move cards as a product: the headline for every kind of market, the low-interest filter, groups of bets and the
 * settled P&L, worked by hand. */
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "@/lib/moves/copy";
import { groupFeed, settledPnl, type FeedItem } from "@/lib/moves/feed";
import { groupBets, groupTitle } from "@/lib/moves/group";
import { chance, claimOf, headlineOf, short, sublineOf } from "@/lib/moves/headline";
import { lowInterest } from "@/lib/moves/interest";
import type { Move } from "@/lib/moves/types";

const H = 3_600_000;
let k = 0;
const mv = (over: Partial<Move>): Move => ({
  id: `m${++k}`, source: "polymarket", marketId: "0xm", eventTitle: "Brewers vs. Cubs", marketTitle: "Brewers vs. Cubs", outcome: "Brewers", outcomeSide: "yes",
  amount: 17_000, avgPrice: 0.45, wallet: "0xa", walletName: null, at: 0, lastAt: 0, fills: 1, tab: "sports", league: "MLB", category: "sports", url: null,
  result: null, settledAt: null, ...over,
} as Move);
const say = (marketTitle: string, outcome: string, o: Partial<Move> = {}) => claimOf(mv({ marketTitle, outcome, ...o }));

describe("headline: the outcome in plain English (claimOf: what the money is on)", () => {
  it("moneyline, spread, totals and inning props", () => {
    expect(headlineOf(mv({ amount: 68_765 }))).toBe("Brewers to beat the Cubs");
    expect(headlineOf(mv({ eventTitle: "Warriors vs. Timberwolves", marketTitle: "Warriors vs. Timberwolves", outcome: "Warriors", league: "NBA" }))).toBe("Warriors to beat the Timberwolves");
    expect(headlineOf(mv({ eventTitle: "Arsenal vs. Chelsea", marketTitle: "Arsenal vs. Chelsea", outcome: "Chelsea", league: "soccer" }))).toBe("Chelsea to beat Arsenal");
    expect(headlineOf(mv({ marketTitle: "Spread: Brewers (-1.5)" }))).toBe("Brewers to win by 2 or more");
    expect(headlineOf(mv({ amount: 1 })).includes("says")).toBe(false);
    expect(say("Spread: Brewers (-1.5)", "Brewers")).toBe("Brewers win by 2 or more");
    expect(say("Spread: Brewers (-1.5)", "Cubs")).toBe("Cubs win or lose by 1 or less");
    expect(say("Brewers vs. Cubs: O/U 8.5", "Over")).toBe("9 or more runs");
    expect(say("Brewers vs. Cubs: O/U 8.5", "Under")).toBe("8 or fewer runs");
    expect(headlineOf(mv({ marketTitle: "Brewers vs. Cubs: 1st Inning Runs O/U 0.5", outcome: "Under" }))).toBe("No runs in the 1st inning");
    expect(say("Lakers vs. Celtics: O/U 221.5", "Over", { league: "NBA" })).toBe("222 or more points");
    expect(say("Arsenal vs. Chelsea: O/U 2.5", "Under", { league: "soccer" })).toBe("2 or fewer goals");
  });

  it("player lines, draws, soccer yes/no and esports maps", () => {
    expect(say("Patrick Mahomes: Passing Yards O/U 275.5", "Over", { league: "NFL", eventTitle: "Chiefs vs. Bills" })).toBe("Patrick Mahomes over 275.5 passing yards");
    expect(say("Will Arsenal FC vs. Chelsea FC end in a draw?", "Yes", { league: "soccer", eventTitle: "Arsenal FC vs. Chelsea FC" })).toBe("Arsenal FC vs. Chelsea FC ends in a draw");
    expect(say("Will Arsenal FC win on 2026-10-30?", "No", { league: "soccer" })).toBe("Arsenal FC don't win");
    expect(say("Liquid vs. Spirit - Map 2 Winner", "Spirit", { league: "other" })).toBe("Spirit win map 2");
    expect(say("Packers win?", "No", { league: "NFL" })).toBe("Packers don't win");
    expect(say("Packers win?", "Yes", { league: "NFL" })).toBe("Packers win");
    expect(say("E2E fixture team wins?", "Yes", { league: "NFL" })).toBe("E2E fixture team wins");
  });

  it("yes/no questions, statements and multi-outcome markets", () => {
    const mk = { tab: "markets" as const, league: null, category: "economics" };
    expect(say("Will the Fed cut rates in December?", "Yes", mk)).toBe("the Fed will cut rates in December");
    expect(say("Will the Fed cut rates in December?", "No", mk)).toBe("the Fed won't cut rates in December");
    expect(say("Will there be a government shutdown by Nov 1?", "Yes", mk)).toBe("there will be a government shutdown by Nov 1");
    expect(say("Bitcoin above $100,000 on Friday?", "No", { ...mk, tab: "crypto" })).toBe("Bitcoin not above $100,000 on Friday");
    expect(say("Who will win the Super Bowl?", "Chiefs", mk)).toBe("Chiefs");
    expect(headlineOf(mv({ marketTitle: "Who will win the Super Bowl?", outcome: "Chiefs", ...mk }))).toBe("Chiefs to win the Super Bowl");
    expect(headlineOf(mv({ marketTitle: "Will the Fed cut rates in December?", outcome: "Yes", ...mk }))).toBe("The Fed will cut rates in December");
    expect(say("Fed decision in December?", "No change", mk)).toBe("“No change” on Fed decision in December");
    expect(say("Is it raining in Paris?", "No", mk)).toBe("No on “Is it raining in Paris?”");
  });

  it("stocks say what was bought and by whom", () => {
    const d = { kind: "insider", company: "NVIDIA CORP", ticker: "NVDA", issuerCik: "1", role: "CEO", ownerName: "HUANG JEN HSUN", ownerCik: "2", shares: 1, pricePerShare: 1, tradeDate: "2026-10-22", filedAt: 0, accession: "a" } as const;
    expect(headlineOf(mv({ source: "sec", tab: "stocks", amount: 1_400_000, detail: d }))).toBe("Nvidia stock, bought by its CEO");
    expect(headlineOf(mv({ source: "sec", tab: "stocks", amount: 300_000, detail: { ...d, role: "Director" } }))).toBe("Nvidia stock, bought by a director");
    expect(headlineOf(mv({ source: "sec", tab: "stocks", amount: 300_000, detail: { ...d, role: "The Chief Executive Officer" } }))).toBe("Nvidia stock, bought by its CEO");
  });

  it("the grey line: the matchup and the league; chance and short amounts", () => {
    expect(sublineOf({ marketTitle: "Brewers vs. Cubs: O/U 8.5", eventTitle: "Brewers vs. Cubs", tab: "sports", league: "MLB" })).toBe("Brewers vs. Cubs · MLB");
    expect(sublineOf({ marketTitle: "Will the Fed cut rates in December?", eventTitle: "Fed decision in December", tab: "markets", league: null })).toBe("Will the Fed cut rates in December?");
    expect(chance(0.453)).toBe("45%");
    expect(chance(1)).toBeNull();
    expect([short(950), short(17_400), short(1_430_000), short(-370_000)]).toEqual(["$950", "$17K", "$1.4M", "−$370K"]);
  });

  it("never a banned word", () => {
    const lines = [say("Spread: Brewers (-1.5)", "Brewers"), say("Brewers vs. Cubs: O/U 8.5", "Over"), say("Will the Fed cut rates in December?", "Yes", { tab: "markets" })];
    for (const l of lines) for (const b of BANNED_WORDS) expect(l).not.toMatch(b);
  });
});

describe("the default feed leaves out low-interest markets", () => {
  it("esports, single innings or maps, small leagues and low goal lines", () => {
    expect(lowInterest(mv({}))).toBeNull();
    expect(lowInterest(mv({ league: "other", eventTitle: "Dota 2: Liquid vs. Spirit", marketTitle: "Liquid vs. Spirit" }))).toBe("esports");
    expect(lowInterest(mv({ marketTitle: "Brewers vs. Cubs: 1st Inning Runs O/U 0.5" }))).toBe("part");
    expect(lowInterest(mv({ league: "soccer", eventTitle: "Arsenal vs. Chelsea", marketTitle: "Arsenal vs. Chelsea: O/U 1.5" }))).toBe("low goal line");
    expect(lowInterest(mv({ league: "soccer", eventTitle: "Arsenal vs. Chelsea", marketTitle: "Arsenal vs. Chelsea: O/U 2.5" }))).toBeNull();
    expect(lowInterest(mv({ league: "other", eventTitle: "Sparta Prague vs. Slavia Prague", marketTitle: "Sparta Prague vs. Slavia Prague" }))).toBe("small league");
    expect(lowInterest(mv({ tab: "markets", league: null, marketTitle: "Will the Fed cut?" }))).toBeNull();
  });
});

describe("bets on the same outcome within the hour are one card", () => {
  it("groups by market and outcome, newest first, an hour from the newest", () => {
    const l = [{ id: "a", at: 10 * H }, { id: "b", at: 9.6 * H }, { id: "c", at: 9.2 * H, outcome: "Cubs" }, { id: "d", at: 9.1 * H }, { id: "e", at: 8.9 * H }]
      .map(x => ({ marketId: "0xm", outcome: "Brewers", source: "polymarket", amount: 10, ...x }));
    expect(groupBets(l).map(g => g.map(x => x.id))).toEqual([["a", "b", "d"], ["c"], ["e"]]);
    expect(groupTitle(4, "Brewers", 68_765)).toBe("4 big bets on Brewers · $68,765");
  });

  it("a group card adds up its bets; settled P&L only when every bet's is known", () => {
    const item = (id: string, amount: number, at: number, o: Partial<FeedItem> = {}) => ({ id, source: "polymarket", marketId: "0xm", outcome: "Brewers", at, amount, avgPrice: 0.5, inAt: "50%", result: null, pnl: null, headline: "", ...o }) as FeedItem;
    const [g] = groupFeed([item("a", 30_000, 2 * H), item("b", 10_000, 1.5 * H, { avgPrice: 0.3 })]);
    expect(g).toMatchObject({ id: "g:b", amount: 40_000, groupTitle: "2 big bets on Brewers · $40,000", inAt: "45%" });
    expect(g!.bets!.map(b => b.id)).toEqual(["a", "b"]);
    const [s] = groupFeed([item("a", 30_000, 2 * H, { result: "won", pnl: 30_000 }), item("b", 10_000, 1.5 * H, { result: "won", pnl: 5_000 })]);
    expect(s).toMatchObject({ result: "won", pnl: 35_000 });
  });

  it("settled P&L from real payouts", () => {
    expect(settledPnl({ source: "polymarket", result: "won", pnl: 188_000, amount: 100_000, avgPrice: 0.4 })).toBe(188_000);
    expect(settledPnl({ source: "polymarket", result: "won", pnl: null, amount: 100_000, avgPrice: 0.4 })).toBeNull();
    // Kalshi: the settled contracts pay $1 each: $40,000 at 40% buys 100,000, pays $100,000, +$60,000.
    expect(settledPnl({ source: "kalshi", result: "won", pnl: null, amount: 40_000, avgPrice: 0.4 })).toBeCloseTo(60_000);
    expect(settledPnl({ source: "kalshi", result: "lost", pnl: null, amount: 40_000, avgPrice: 0.4 })).toBe(-40_000);
    expect(settledPnl({ source: "kalshi", result: null, pnl: null, amount: 1, avgPrice: 0.4 })).toBeNull();
  });
});
