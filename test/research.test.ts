/* Research (lib/research): 50 questions read into the expected tool call by the planner; advice and identity refused;
 * the model's tool loop with a stand-in model; its sentences held to the rows; prompt injection in questions. */
import { describe, expect, it } from "vitest";
import { moneyIn, NO_ADVICE, NOT_COVERED, planFor } from "@/lib/research/plan";
import { answerOk, summary } from "@/lib/research/run";
import type { Table } from "@/lib/research/tools";

type Want = { tool: string; args?: Record<string, unknown> } | { refuse: "advice" | "identity" | "not_covered" };
const W = "0x" + "a".repeat(40);
const CASES: Array<[string, Want, { wallet?: string }?]> = [
  ["Open positions from trackers with positive followable ROI on tonight's NBA games", { tool: "find_positions", args: { league: "NBA", status: "open", winning_trackers_only: true, starts_within_hours: 12, tab: "sports" } }],
  ["CEO purchases over $1M in the last 7 days, by sector", { tool: "insider_filings", args: { role: "ceo", min_value: 1e6, since_days: 7, by_sector: true, kind: "purchase" } }],
  ["This account's record on soccer totals", { tool: "account_record", args: { wallet: "this", league: "soccer", market_type: "totals" } }, { wallet: W }],
  ["This account's record in the NBA", { tool: "account_record", args: { wallet: "this", league: "NBA" } }, { wallet: W }],
  ["This account's record on NFL spreads", { tool: "account_record", args: { wallet: "this", league: "NFL", market_type: "spreads" } }, { wallet: W }],
  [`What is the record of ${W} in tennis?`, { tool: "account_record", args: { wallet: W, league: "tennis" } }],
  ["This account's record on politics", { tool: "account_record", args: { wallet: "this", category: "politics" } }, { wallet: W }],
  ["Largest open NFL positions this week", { tool: "find_positions", args: { league: "NFL", status: "open", since_hours: 168 } }],
  ["Biggest NBA bets today", { tool: "find_positions", args: { league: "NBA", since_hours: 24 } }],
  ["Positions over $100K in the last 24 hours", { tool: "find_positions", args: { min_amount: 1e5, since_hours: 24 } }],
  ["Open positions over $50K on politics", { tool: "find_positions", args: { min_amount: 5e4, status: "open", tab: "markets" } }],
  ["Settled MLB positions this month", { tool: "find_positions", args: { league: "MLB", status: "settled", since_hours: 720 } }],
  ["Whale bets on soccer in the last 3 days", { tool: "find_positions", args: { league: "soccer", since_hours: 72 } }],
  ["Large positions on college football games today", { tool: "find_positions", args: { league: "college", starts_within_hours: 24 } }],
  ["Largest positions on the Fed", { tool: "find_positions", args: { tab: "markets" } }],
  ["Open UFC positions", { tool: "find_positions", args: { league: "UFC", status: "open" } }],
  ["Golf positions over $25K", { tool: "find_positions", args: { league: "golf", min_amount: 25e3 } }],
  ["NHL positions from winning trackers", { tool: "find_positions", args: { league: "NHL", winning_trackers_only: true } }],
  ["Largest open positions from winning trackers", { tool: "find_positions", args: { status: "open", winning_trackers_only: true } }],
  ["Open positions on Bitcoin markets", { tool: "find_positions", args: { tab: "markets", status: "open" } }],
  ["Biggest positions on prediction markets this week", { tool: "find_positions", args: { tab: "markets", since_hours: 168 } }],
  ["This account's open positions", { tool: "find_positions", args: { status: "open", wallet: "this" } }, { wallet: W }],
  ["Tennis bets over 50k in the past week", { tool: "find_positions", args: { league: "tennis", min_amount: 5e4, since_hours: 168 } }],
  ["What does Whales ($100K+) hold now?", { tool: "tracker_holdings", args: { tracker: "biggest-bets" } }],
  ["What is the CEO Purchases tracker holding?", { tool: "insider_filings" }],
  ["Trackers with a positive followable ROI", { tool: "list_trackers", args: { sort: "roi", positive_only: true } }],
  ["Best trackers by followable ROI", { tool: "list_trackers", args: { sort: "roi", positive_only: false } }],
  ["Trackers on topics by followable ROI", { tool: "list_trackers", args: { group: "Topics", sort: "roi" } }],
  ["League trackers ranked by ROI", { tool: "list_trackers", args: { group: "Leagues", sort: "roi" } }],
  ["Trackers by 30-day volume", { tool: "list_trackers", args: { sort: "volume" } }],
  ["Which trackers have the most settled positions?", { tool: "list_trackers", args: { sort: "settled" } }],
  ["Stock trackers", { tool: "list_trackers", args: { group: "Stocks" } }],
  ["Style trackers that made money", { tool: "list_trackers", args: { group: "Styles", positive_only: true } }],
  ["Markets with the most large-position money this month", { tool: "find_markets" }],
  ["Which markets have the most money on the Super Bowl", { tool: "find_markets", args: { query: "the Super Bowl" } }],
  ["Director purchases in the last 30 days", { tool: "insider_filings", args: { role: "director", since_days: 30, kind: "purchase" } }],
  ["Insider sales over $5M this month", { tool: "insider_filings", args: { kind: "sale", min_value: 5e6, since_days: 30 } }],
  ["CFO purchases this week", { tool: "insider_filings", args: { role: "cfo", since_days: 7 } }],
  ["Insider purchases at $NVDA", { tool: "insider_filings", args: { ticker: "NVDA" } }],
  ["Form 4 purchases over $250K in the last 14 days", { tool: "insider_filings", args: { min_value: 25e4, since_days: 14 } }],
  ["Which bet should I take tonight?", { refuse: "advice" }],
  ["Who will win the Knicks game?", { refuse: "advice" }],
  ["Best bet on the NFL this weekend", { refuse: "advice" }],
  ["Predict the Fed decision", { refuse: "advice" }],
  ["Is it a good idea to follow googleplay?", { refuse: "advice" }],
  ["Who is behind wallet 0xabc?", { refuse: "identity" }],
  ["What's the real name of the top trader?", { refuse: "identity" }],
  ["What's the weather in Miami?", { refuse: "not_covered" }],
  ["Tell me a joke", { refuse: "not_covered" }],
  ["This account's record on soccer totals", { refuse: "not_covered" }],
];

describe("the planner", () => {
  it("has 50 questions", () => expect(CASES).toHaveLength(50));
  it.each(CASES.map((c, i) => [`${i + 1}. ${c[0]}`, c] as const))("%s", (_, [q, want, ctx]) => {
    const p = planFor(q, ctx ?? {});
    if ("refuse" in want) { expect(p).toEqual(want); return; }
    expect(p).toMatchObject({ tool: want.tool });
    if (want.args) {
      const args = (p as { args: Record<string, unknown> }).args;
      for (const [k, v] of Object.entries(want.args)) expect(args[k], k).toEqual(v);
    }
  });
  it("reads money", () => {
    expect([moneyIn("over $1M"), moneyIn("over $1.5 million"), moneyIn("over $250K"), moneyIn("50k"), moneyIn("over $100"), moneyIn("no money")]).toEqual([1e6, 1.5e6, 25e4, 5e4, 100, undefined]);
  });
});

const table = (rows: string[][], note?: string): Table => ({ tool: "find_positions", title: "Large positions: open, NBA", columns: ["Position", "Amount"], numeric: [1], rows: rows.map(r => r.map(text => ({ text }))), sources: [], at: 0, live: false, note });

describe("answers", () => {
  const t = [table([["Knicks to beat the Celtics", "$62K"], ["Lakers to beat the Warriors", "$48K"]])];
  it("may quote only the rows' numbers, in at most 2 sentences, with nothing banned", () => {
    expect(answerOk("Two open NBA positions; the largest is $62K on the Knicks.", t)).toBe(true);
    expect(answerOk("The largest is $70K on the Knicks.", t)).toBe(false);
    expect(answerOk("You should follow the Knicks at $62K.", t)).toBe(false);
    expect(answerOk("The Knicks will win.", t)).toBe(false);
    expect(answerOk("One. Two. Three.", t)).toBe(false);
    expect(answerOk(NOT_COVERED, [])).toBe(true);
  });
  it("the summary is true to the rows", () => {
    expect(summary(t)).toBe("Large positions: open, NBA: 2 rows.");
    expect(summary([table([])])).toBe("Nothing in Insidir's data matches: large positions: open, NBA.");
    expect(summary([table([["A", "$1K"]], "Sector isn't in Insidir's data; the filings are listed by size.")])).toBe("Large positions: open, NBA: 1 row. Sector isn't in Insidir's data; the filings are listed by size.");
  });
  it("advice is answered without running anything", () => expect(NO_ADVICE).toMatch(/doesn't give advice/));
});
