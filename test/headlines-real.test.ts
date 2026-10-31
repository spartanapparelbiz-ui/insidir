/* Headlines for real market titles (lib/moves/headline.ts headlineOf). Rows marked "prod" are copied from production
 * (the worker's accuracy log, Oct 28 2026); the rest are the exact title shapes Polymarket and Kalshi publish
 * (Kalshi: title + yes_sub_title / no_sub_title; futures; politics). Each expects the exact headline. */
import { describe, expect, it } from "vitest";
import { headlineOf } from "@/lib/moves/headline";
import type { League, Move } from "@/lib/moves/types";

type Row = [src: "pm" | "k", tab: "sports" | "markets", league: League | null, category: string | null, event: string, title: string, outcome: string, side: "yes" | "no", expected: string, prod?: true];

const ROWS: Row[] = [
  // Polymarket moneylines, spreads and totals (prod)
  ["pm", "sports", "NBA", "sports", "Trail Blazers vs. Lakers", "Trail Blazers vs. Lakers", "Trail Blazers", "yes", "Trail Blazers to beat the Lakers", true],
  ["pm", "sports", "NBA", "sports", "Trail Blazers vs. Lakers", "Trail Blazers vs. Lakers", "Lakers", "no", "Lakers to beat the Trail Blazers", true],
  ["pm", "sports", "NHL", "sports", "Devils vs. Stars", "Devils vs. Stars", "Stars", "no", "Stars to beat the Devils", true],
  ["pm", "sports", "college", "sports", "Delaware vs. Western Kentucky", "Delaware vs. Western Kentucky", "Western Kentucky", "no", "Western Kentucky to beat Delaware", true],
  ["pm", "sports", "MLB", "sports", "Milwaukee Brewers vs. Tampa Bay Rays", "Milwaukee Brewers vs. Tampa Bay Rays", "Milwaukee Brewers", "yes", "Milwaukee Brewers to beat the Tampa Bay Rays", true],
  ["pm", "sports", "NFL", "sports", "Panthers vs. Jets", "Panthers vs. Jets", "Jets", "no", "Jets to beat the Panthers", true],
  ["pm", "sports", "soccer", "sports", "BV Borussia 09 Dortmund vs. FC Augsburg", "Spread: BV Borussia 09 Dortmund (-1.5)", "BV Borussia 09 Dortmund", "yes", "BV Borussia 09 Dortmund to win by 2 or more", true],
  ["pm", "sports", "NBA", "sports", "Trail Blazers vs. Lakers", "Spread: Lakers (-1.5)", "Trail Blazers", "no", "Trail Blazers to win or lose by 1 or less", true],
  ["pm", "sports", "NBA", "sports", "Trail Blazers vs. Lakers", "Spread: Lakers (-2.5)", "Trail Blazers", "no", "Trail Blazers to win or lose by 2 or less", true],
  ["pm", "sports", "NBA", "sports", "Trail Blazers vs. Lakers", "Trail Blazers vs. Lakers: O/U 233.5", "Under", "no", "233 or fewer points", true],
  // Polymarket, more shapes
  ["pm", "sports", "NBA", "sports", "Knicks vs. Celtics", "Spread: Knicks (-6.5)", "Knicks", "yes", "Knicks to win by 7 or more"],
  ["pm", "sports", "NBA", "sports", "Knicks vs. Celtics", "Knicks vs. Celtics: O/U 221.5", "Over", "yes", "222 or more points"],
  ["pm", "sports", "MLB", "sports", "Dodgers vs. Blue Jays", "Dodgers vs. Blue Jays: 1st Inning Runs O/U 0.5", "Under", "no", "No runs in the 1st inning"],
  ["pm", "sports", "MLB", "sports", "Dodgers vs. Blue Jays", "Dodgers vs. Blue Jays: O/U 8.5", "Over", "yes", "9 or more runs"],
  ["pm", "sports", "NHL", "sports", "Rangers vs. Bruins", "Rangers vs. Bruins: O/U 5.5", "Under", "no", "5 or fewer goals"],
  ["pm", "sports", "soccer", "sports", "Arsenal vs. Chelsea", "Will Arsenal FC win on 2026-11-02?", "Yes", "yes", "Arsenal FC to win"],
  ["pm", "sports", "soccer", "sports", "Arsenal vs. Chelsea", "Will Arsenal FC win on 2026-11-02?", "No", "no", "Arsenal FC not to win"],
  ["pm", "sports", "soccer", "sports", "Arsenal vs. Chelsea", "Will Arsenal vs. Chelsea end in a draw?", "Yes", "yes", "Arsenal vs. Chelsea ends in a draw"],
  ["pm", "sports", "soccer", "sports", "Arsenal vs. Chelsea", "Arsenal vs. Chelsea: O/U 2.5", "Over", "yes", "3 or more goals"],
  ["pm", "sports", "NFL", "sports", "Chiefs vs. Bills", "Chiefs vs. Bills", "Chiefs", "yes", "Chiefs to beat the Bills"],
  ["pm", "sports", "NFL", "sports", "Chiefs vs. Bills", "Spread: Bills (-3.5)", "Chiefs", "no", "Chiefs to win or lose by 3 or less"],
  ["pm", "sports", "NFL", "sports", "Chiefs vs. Bills", "Patrick Mahomes: Passing Yards O/U 275.5", "Over", "yes", "Patrick Mahomes over 275.5 passing yards"],
  ["pm", "sports", "UFC", "sports", "UFC 322: Makhachev vs. Della Maddalena", "Makhachev vs. Della Maddalena", "Makhachev", "yes", "Makhachev to beat Della Maddalena"],
  ["pm", "sports", "tennis", "sports", "Sinner vs. Alcaraz", "Sinner vs. Alcaraz", "Alcaraz", "no", "Alcaraz to beat Sinner"],
  ["pm", "sports", "NBA", "sports", "2027 NBA Champion", "Will the Knicks win the 2027 NBA Finals?", "No", "no", "Knicks not to win the 2027 NBA Finals"],
  ["pm", "sports", "NBA", "sports", "2027 NBA Champion", "Will the Knicks win the 2027 NBA Finals?", "Yes", "yes", "Knicks to win the 2027 NBA Finals"],
  ["pm", "sports", "NFL", "sports", "Super Bowl Champion 2027", "Will the Philadelphia Eagles win Super Bowl 2027?", "Yes", "yes", "Philadelphia Eagles to win Super Bowl 2027"],
  ["pm", "sports", "NFL", "sports", "Super Bowl Champion 2027", "Who will win the Super Bowl?", "Chiefs", "yes", "Chiefs to win the Super Bowl"],
  ["pm", "sports", "golf", "sports", "World Wide Technology Championship Winner", "Will Scottie Scheffler win the World Wide Technology Championship?", "No", "no", "Scottie Scheffler not to win the World Wide Technology Championship"],
  // Kalshi sports: title + yes/no sub-titles
  ["k", "sports", "college", "sports", "Charlotte at Duke", "Charlotte at Duke Winner?", "Charlotte", "yes", "Charlotte to beat Duke"],
  ["k", "sports", "college", "sports", "Charlotte at Duke", "Charlotte wins by over 5.5 points?", "Charlotte wins by over 5.5 Points", "yes", "Charlotte to win by 6 or more"],
  ["k", "sports", "college", "sports", "Charlotte at Duke", "Charlotte wins by over 5.5 points?", "No", "no", "Charlotte not to win by 6 or more"],
  ["k", "sports", "NBA", "sports", "Lakers at Warriors", "Lakers at Warriors Winner?", "Warriors", "yes", "Warriors to beat the Lakers"],
  ["k", "sports", "NBA", "sports", "Lakers at Warriors", "Warriors wins by over 3.5 points?", "Warriors wins by over 3.5 Points", "yes", "Warriors to win by 4 or more"],
  ["k", "sports", "NBA", "sports", "Lakers at Warriors", "Lakers at Warriors: Total Points", "Over 229.5 points scored", "yes", "230 or more points"],
  ["k", "sports", "NFL", "sports", "Bills at Chiefs", "Bills at Chiefs Winner?", "Bills", "yes", "Bills to beat the Chiefs"],
  ["k", "sports", "NFL", "sports", "Bills at Chiefs", "Chiefs wins by over 2.5 points?", "No", "no", "Chiefs not to win by 3 or more"],
  ["k", "sports", "NHL", "sports", "Bruins at Rangers", "Bruins at Rangers Winner?", "Rangers", "yes", "Rangers to beat the Bruins"],
  ["k", "sports", "MLB", "sports", "Dodgers at Blue Jays", "Dodgers wins by over 1.5 runs?", "Dodgers wins by over 1.5 Runs", "yes", "Dodgers to win by 2 or more"],
  ["k", "sports", "NBA", "sports", "Pro Basketball Champion", "Will the New York Knicks win the 2027 Pro Basketball Finals?", "No", "no", "New York Knicks not to win the 2027 Pro Basketball Finals"],
  ["k", "sports", "soccer", "sports", "Arsenal vs Chelsea", "Arsenal vs Chelsea Winner?", "Tie", "yes", "Arsenal vs Chelsea ends in a draw"],
  ["k", "sports", "soccer", "sports", "Arsenal vs Chelsea", "Arsenal vs Chelsea Winner?", "Arsenal", "yes", "Arsenal to beat Chelsea"],
  // Politics and other markets, both venues
  ["pm", "markets", null, "politics", "Texas Senate Election Winner", "Will the Republicans win the Texas Senate race?", "No", "no", "The Republicans don't win the Texas Senate race"],
  ["pm", "markets", null, "politics", "Texas Senate Election Winner", "Will the Republicans win the Texas Senate race?", "Yes", "yes", "The Republicans win the Texas Senate race"],
  ["pm", "markets", null, "politics", "Texas Senate Election Winner", "James Talarico", "Yes", "yes", "Talarico wins the Texas Senate election"],
  ["pm", "markets", null, "politics", "Texas Senate Election Winner", "James Talarico", "No", "no", "Talarico doesn't win the Texas Senate election"],
  ["pm", "markets", null, "politics", "NYC Mayoral Election", "Will Zohran Mamdani win the NYC mayoral election?", "No", "no", "Mamdani doesn't win the NYC mayoral election"],
  ["pm", "markets", null, "politics", "NYC Mayoral Election", "Will Zohran Mamdani win the NYC mayoral election?", "Yes", "yes", "Mamdani wins the NYC mayoral election"],
  ["k", "markets", null, "politics", "House control 2026", "Will Democrats win the House in 2026?", "Yes", "yes", "The Democrats win the House in 2026"],
  ["k", "markets", null, "politics", "House control 2026", "Will Democrats win the House in 2026?", "No", "no", "The Democrats don't win the House in 2026"],
  ["pm", "markets", null, "politics", "Presidential Election Winner 2028", "Who will win the 2028 presidential election?", "JD Vance", "yes", "JD Vance to win the 2028 presidential election"],
  ["pm", "markets", null, "economics", "Fed decision in December", "Will the Fed cut rates in December?", "Yes", "yes", "The Fed will cut rates in December"],
  ["pm", "markets", null, "economics", "Fed decision in December", "Will the Fed cut rates in December?", "No", "no", "The Fed won't cut rates in December"],
  ["k", "markets", null, "economics", "Fed rate decision", "Will the Fed hike rates in December 2026?", "No", "no", "The Fed won't hike rates in December 2026"],
  ["pm", "markets", null, "crypto", "Bitcoin price on Friday", "Bitcoin above $100,000 on Friday?", "Yes", "yes", "Bitcoin above $100,000 on Friday"],
  ["pm", "markets", null, "crypto", "Bitcoin price on Friday", "Bitcoin above $100,000 on Friday?", "No", "no", "Bitcoin not above $100,000 on Friday"],
  ["pm", "markets", null, "politics", "Ukraine ceasefire in 2026", "Will there be a ceasefire in Ukraine in 2026?", "No", "no", "There won't be a ceasefire in Ukraine in 2026"],
  ["k", "markets", null, "politics", "Government shutdown", "Will the government shut down by Nov 21?", "Yes", "yes", "Yes on “Will the government shut down by Nov 21?”"],
  ["pm", "markets", null, "tech", "OpenAI announcements", "Will OpenAI release GPT-6 in 2026?", "No", "no", "OpenAI won't release GPT-6 in 2026"],
  ["pm", "markets", null, "politics", "Next UK Prime Minister", "Who will be the next UK Prime Minister?", "Keir Starmer", "yes", "Keir Starmer to be the next UK Prime Minister"],
];

const move = ([src, tab, league, category, event, title, outcome, side]: Row): Move => ({
  id: "x", source: src === "pm" ? "polymarket" : "kalshi", marketId: src === "pm" ? "0xm" : "KX-M", eventTitle: event, marketTitle: title, outcome, outcomeSide: side,
  amount: 50_000, avgPrice: 0.5, wallet: src === "pm" ? "0xw" : null, walletName: null, at: new Date(0), lastAt: new Date(0), fills: 1, tab, league, category,
} as unknown as Move);

describe("headlines for real market titles", () => {
  it("has 60 cases, both venues, sports and politics", () => {
    expect(ROWS).toHaveLength(60);
    expect(ROWS.filter(r => r[0] === "k").length).toBeGreaterThanOrEqual(15);
    expect(ROWS.filter(r => r[3] === "politics").length).toBeGreaterThanOrEqual(10);
  });
  it.each(ROWS.map(r => [r[8], r] as const))("%s", (_, r) => {
    expect(headlineOf(move(r))).toBe(r[8]);
  });
});
