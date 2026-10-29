/* What the default feed leaves out, pure ("Show all" brings it back). Low interest: esports, single maps or games
 * inside a match, inning / period / half / quarter props, sports outside the major leagues, and low goal lines
 * (O/U under 2.5 goals). Everything else shows, newest first. */
import type { Move } from "./types";
import { leagueLabel } from "./leagues";

/** The competitions the default feed keeps (labels from lib/moves/leagues.ts). */
export const MAJOR = new Set(["NFL", "NBA", "WNBA", "MLB", "NHL", "College football", "College basketball", "College", "UFC", "ATP", "WTA", "Tennis", "Golf",
  "Champions League", "Europa League", "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "MLS", "World Cup", "Soccer", "Boxing", "F1"]);
const ESPORTS = new Set(["Counter-Strike", "Dota 2", "League of Legends", "Valorant", "Rocket League", "Call of Duty"]);
const PART = /\b(map|game)\s*\d\b|\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|first|second|third|fourth)\s+(inning|period|half|quarter|set)\b|\b1h\b|\b2h\b|\bf5\b/i;

export type LowReason = "esports" | "part" | "small league" | "low goal line";

export function lowInterest(m: Pick<Move, "tab" | "league" | "eventTitle" | "marketTitle" | "marketId" | "outcome">): LowReason | null {
  if (m.tab !== "sports") return null;
  const label = leagueLabel(m);
  if ((label && ESPORTS.has(label)) || /\b(esports?|cs2|csgo|dota|valorant|lol:)\b/i.test(`${m.eventTitle} ${m.marketTitle}`)) return "esports";
  if (PART.test(m.marketTitle)) return "part";
  const ou = /(?:o\/u|over\/under|total[^0-9]*)\s*(\d+(?:\.\d+)?)/i.exec(m.marketTitle);
  if (ou && (m.league === "soccer" || m.league === "NHL" || /\bgoals?\b/i.test(m.marketTitle)) && Number(ou[1]) < 2.5) return "low goal line";
  if (!label || !MAJOR.has(label)) return "small league";
  return null;
}
