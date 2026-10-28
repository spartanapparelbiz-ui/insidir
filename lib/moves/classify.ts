/* Which tab a move belongs to, and its league (docs/INSIDIR-V2.md §3). From the venue's normalised category
 * (lib/exchanges/categories) and the event/market words: Polymarket event tags, Kalshi series tickers and titles. */
import { clubLeagueOf, competitionOf } from "./leagues";
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
  ["soccer", ["soccer", "fc", "premier league", "epl", "la liga", "serie a", "bundesliga", "ligue 1", "champions league", "uefa", "mls", "fifa", "world cup"]],
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

/** Titles that can only be a game, for a market whose venue category didn't say sports (Polymarket esports, totals,
 *  spreads and "Will X win on <date>?" football markets). Never just "vs": elections use it too. */
const SPORT_TITLE = /\b(o\/u \d+(?:\.\d+)?|over\/under|spread:|moneyline|map handicap|game \d+ winner|map \d+ winner|\(bo\d\)|counter-strike|dota 2|league of legends|valorant|rocket league|call of duty|nba|nfl|nhl|mlb|wnba|ufc|atp|wta|premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|mls)(?![a-z0-9])|\bwill .{2,40} (fc|cf|afc|sc) win on \d{4}-\d{2}-\d{2}/i;

export const looksLikeSport = (words: ReadonlyArray<string | null | undefined>): boolean => SPORT_TITLE.test(words.filter(Boolean).join(" \n "));

/** A sports move's filter league: the league words, else a competition or club the titles name (Serie A → soccer). */
export function sportsLeagueOf(words: ReadonlyArray<string | null | undefined>): League {
  const l = leagueOf(words);
  if (l !== "other") return l;
  return competitionOf(words)?.league ?? clubLeagueOf(words)?.league ?? "other";
}

export function classify(category: string, words: ReadonlyArray<string | null | undefined>): { tab: Tab; league: League | null } {
  if (category === "sports" || (category !== "crypto" && looksLikeSport(words))) return { tab: "sports", league: sportsLeagueOf(words) };
  if (category === "crypto") return { tab: "crypto", league: null };
  return { tab: "markets", league: null };
}
