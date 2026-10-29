/* Ten bet slips from different books, as each prints them (American, decimal or cents; singles and parlays; winners,
 * lines, totals, props and yes/no contracts), and what reading each one should give. Rendered to test/fixtures/slips
 * by scripts/slips/render.mjs (made-up slips in each book's general layout: text only, no logos, no real accounts),
 * read by the real model in scripts/check-slips.ts, and used as recorded readings in test/check.test.ts. */
import type { Slip } from "@/lib/check/extract";

export interface SlipFixture {
  file: string;
  book: string;
  /** How the slip shows its legs. */
  layout: "sportsbook" | "contract";
  title: string;
  wager: string;
  payout: string;
  lines: Array<{ pick: string; market: string; event: string; odds: string; when?: string }>;
  expect: Slip;
}

const leg = (o: Partial<Slip["legs"][number]> & Pick<Slip["legs"][number], "event" | "selection" | "market_type">): Slip["legs"][number] =>
  ({ sport: null, line: null, over_under: null, odds: null, stake: null, date: null, ...o });

export const SLIPS: SlipFixture[] = [
  { file: "draftkings-parlay.png", book: "DraftKings", layout: "sportsbook", title: "3 Leg Parlay", wager: "$25.00", payout: "$171.42",
    lines: [
      { pick: "Milwaukee Brewers", market: "Moneyline", event: "MIL Brewers @ CHI Cubs", odds: "-120", when: "Sep 12, 2026" },
      { pick: "Over 8.5", market: "Total Runs", event: "MIL Brewers @ CHI Cubs", odds: "-105", when: "Sep 12, 2026" },
      { pick: "Kansas City Chiefs -3.5", market: "Spread", event: "KC Chiefs @ BUF Bills", odds: "-110", when: "Sep 13, 2026" },
    ],
    expect: { is_bet_slip: true, book: "DraftKings", total_stake: 25, legs: [
      leg({ sport: "MLB", event: "MIL Brewers @ CHI Cubs", selection: "Milwaukee Brewers", market_type: "moneyline", odds: "-120", date: "2026-09-12" }),
      leg({ sport: "MLB", event: "MIL Brewers @ CHI Cubs", selection: "Over", market_type: "total", line: 8.5, over_under: "over", odds: "-105", date: "2026-09-12" }),
      leg({ sport: "NFL", event: "KC Chiefs @ BUF Bills", selection: "Kansas City Chiefs", market_type: "spread", line: -3.5, odds: "-110", date: "2026-09-13" }),
    ] } },
  { file: "fanduel-single.png", book: "FanDuel", layout: "sportsbook", title: "Single", wager: "$50.00", payout: "$140.00",
    lines: [{ pick: "Boston Celtics", market: "Moneyline", event: "Los Angeles Lakers @ Boston Celtics", odds: "+180", when: "Oct 30, 2026" }],
    expect: { is_bet_slip: true, book: "FanDuel", total_stake: 50, legs: [leg({ sport: "NBA", event: "Los Angeles Lakers @ Boston Celtics", selection: "Boston Celtics", market_type: "moneyline", odds: "+180", date: "2026-10-30", stake: 50 })] } },
  { file: "betmgm-prop.png", book: "BetMGM", layout: "sportsbook", title: "Straight Bet", wager: "$20.00", payout: "$38.18",
    lines: [{ pick: "Patrick Mahomes Over 275.5", market: "Passing Yards", event: "Kansas City Chiefs at Buffalo Bills", odds: "-110", when: "Sep 13, 2026" }],
    expect: { is_bet_slip: true, book: "BetMGM", total_stake: 20, legs: [leg({ sport: "NFL", event: "Kansas City Chiefs at Buffalo Bills", selection: "Patrick Mahomes Over", market_type: "player_prop", line: 275.5, over_under: "over", odds: "-110", date: "2026-09-13", stake: 20 })] } },
  { file: "caesars-parlay.png", book: "Caesars Sportsbook", layout: "sportsbook", title: "2-Pick Parlay", wager: "$10.00", payout: "$36.40",
    lines: [
      { pick: "Arsenal", market: "Match Result", event: "Arsenal v Chelsea", odds: "+105", when: "Nov 1, 2026" },
      { pick: "Under 2.5", market: "Total Goals", event: "Liverpool v Man City", odds: "+120", when: "Nov 1, 2026" },
    ],
    expect: { is_bet_slip: true, book: "Caesars Sportsbook", total_stake: 10, legs: [
      leg({ sport: "Premier League", event: "Arsenal v Chelsea", selection: "Arsenal", market_type: "moneyline", odds: "+105", date: "2026-11-01" }),
      leg({ sport: "Premier League", event: "Liverpool v Man City", selection: "Under", market_type: "total", line: 2.5, over_under: "under", odds: "+120", date: "2026-11-01" }),
    ] } },
  { file: "espnbet-spread.png", book: "ESPN BET", layout: "sportsbook", title: "Straight", wager: "$100.00", payout: "$190.91",
    lines: [{ pick: "Ohio State Buckeyes -7", market: "Spread", event: "Michigan @ Ohio State", odds: "-110", when: "Nov 28, 2026" }],
    expect: { is_bet_slip: true, book: "ESPN BET", total_stake: 100, legs: [leg({ sport: "College football", event: "Michigan @ Ohio State", selection: "Ohio State Buckeyes", market_type: "spread", line: -7, odds: "-110", date: "2026-11-28", stake: 100 })] } },
  { file: "bet365-decimal.png", book: "bet365", layout: "sportsbook", title: "Single", wager: "£20.00", payout: "£52.00",
    lines: [{ pick: "Real Madrid", market: "Full Time Result", event: "Real Madrid v Barcelona", odds: "2.60", when: "Oct 31, 2026" }],
    expect: { is_bet_slip: true, book: "bet365", total_stake: 20, legs: [leg({ sport: "La Liga", event: "Real Madrid v Barcelona", selection: "Real Madrid", market_type: "moneyline", odds: "2.60", date: "2026-10-31", stake: 20 })] } },
  { file: "kalshi-contract.png", book: "Kalshi", layout: "contract", title: "Order filled", wager: "$450.00", payout: "$1,000.00",
    lines: [{ pick: "Yes", market: "1,000 contracts at 45¢", event: "Will the Fed cut rates in December?", odds: "45¢" }],
    expect: { is_bet_slip: true, book: "Kalshi", total_stake: 450, legs: [leg({ event: "Will the Fed cut rates in December?", selection: "Yes", market_type: "yes_no", odds: "45¢", stake: 450 })] } },
  { file: "polymarket-position.png", book: "Polymarket", layout: "contract", title: "Bought", wager: "$300.00", payout: "$1,000.00",
    lines: [{ pick: "No", market: "1,000 shares at 30¢", event: "Bitcoin above $150,000 on December 31?", odds: "30¢" }],
    expect: { is_bet_slip: true, book: "Polymarket", total_stake: 300, legs: [leg({ event: "Bitcoin above $150,000 on December 31?", selection: "No", market_type: "yes_no", odds: "30¢", stake: 300 })] } },
  { file: "robinhood-event.png", book: "Robinhood", layout: "contract", title: "Event contract", wager: "$62.00", payout: "$100.00",
    lines: [{ pick: "Yes", market: "100 contracts at $0.62", event: "Will the Chiefs win Super Bowl LXI?", odds: "$0.62" }],
    expect: { is_bet_slip: true, book: "Robinhood", total_stake: 62, legs: [leg({ sport: "NFL", event: "Will the Chiefs win Super Bowl LXI?", selection: "Yes", market_type: "futures", odds: "$0.62", stake: 62 })] } },
  { file: "fanatics-sgp.png", book: "Fanatics Sportsbook", layout: "sportsbook", title: "Same Game Parlay", wager: "$15.00", payout: "$89.25",
    lines: [
      { pick: "New York Rangers", market: "Moneyline", event: "Rangers @ Bruins", odds: "+130", when: "Nov 2, 2026" },
      { pick: "Over 5.5", market: "Total Goals", event: "Rangers @ Bruins", odds: "-115", when: "Nov 2, 2026" },
    ],
    expect: { is_bet_slip: true, book: "Fanatics Sportsbook", total_stake: 15, legs: [
      leg({ sport: "NHL", event: "Rangers @ Bruins", selection: "New York Rangers", market_type: "moneyline", odds: "+130", date: "2026-11-02" }),
      leg({ sport: "NHL", event: "Rangers @ Bruins", selection: "Over", market_type: "total", line: 5.5, over_under: "over", odds: "-115", date: "2026-11-02" }),
    ] } },
];
