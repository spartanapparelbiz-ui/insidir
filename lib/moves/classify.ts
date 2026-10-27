/* Which tab a move belongs to, and its league (docs/INSIDIR-V2.md §3). From the venue's normalised category
 * (lib/exchanges/categories) and the event/market words: Polymarket event tags, Kalshi series tickers and titles. */
import type { League, Tab } from "./types";

const LEAGUE_WORDS: ReadonlyArray<readonly [League, readonly string[]]> = [
  ["NFL", ["nfl", "super bowl", "kxnfl"]],
  ["NBA", ["nba", "kxnba"]],
  ["MLB", ["mlb", "world series", "kxmlb"]],
  ["NHL", ["nhl", "stanley cup", "kxnhl"]],
  ["college", ["ncaa", "ncaaf", "ncaab", "cfb", "cbb", "college", "march madness", "kxncaa"]],
  ["UFC", ["ufc", "mma", "kxufc"]],
  ["tennis", ["tennis", "atp", "wta", "wimbledon", "us open tennis", "roland garros", "australian open"]],
  ["golf", ["golf", "pga", "masters", "ryder cup", "lpga"]],
  ["soccer", ["soccer", "premier league", "epl", "la liga", "serie a", "bundesliga", "ligue 1", "champions league", "uefa", "mls", "fifa", "world cup"]],
];

export function leagueOf(words: ReadonlyArray<string | null | undefined>): League {
  const text = ` ${words.filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  for (const [league, keys] of LEAGUE_WORDS) {
    for (const k of keys) {
      if (k.startsWith("kx") ? text.includes(` ${k}`) : text.includes(` ${k} `)) return league;
    }
  }
  return "other";
}

export function classify(category: string, words: ReadonlyArray<string | null | undefined>): { tab: Tab; league: League | null } {
  if (category === "sports") return { tab: "sports", league: leagueOf(words) };
  if (category === "crypto") return { tab: "crypto", league: null };
  return { tab: "markets", league: null };
}
