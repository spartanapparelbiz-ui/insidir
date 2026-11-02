/* Team names as people say them: "Los Angeles R at Denver" → "Rams at Broncos". Kalshi writes teams by city, and a city
 * two teams share by city + the nickname's first letter ("Los Angeles R", "New York G"). For the four big leagues
 * (lib/matching/aliases.ts TEAMS), in order:
 *   "Kansas City Chiefs"  → "Chiefs"       city + nickname
 *   "Los Angeles R"       → "Rams"         a shared city + the nickname's initial
 *   "Denver"              → "Broncos"      a city only one team in the league has
 * Other leagues (college, soccer, tennis…) and unknown leagues are left as they are. Pure. */
import { TEAMS, type League, type TeamRow } from "@/lib/matching/aliases";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "St Louis" also matches "St. Louis". */
const cityRe = (city: string) => esc(city).replace(/^St /, "St\\.? ").replace(/ /g, "\\s+");

export function leagueKey(league: string | null | undefined): League | null {
  const l = (league ?? "").trim().toLowerCase();
  return l === "nfl" || l === "nba" || l === "mlb" || l === "nhl" ? l : null;
}

export function fullTeamNames(title: string, league: string | null | undefined): string {
  const lg = leagueKey(league);
  if (!lg) return title;
  const teams = [...TEAMS[lg]].sort((a, b) => b.city.length - a.city.length);
  const shared = new Set(teams.filter(t => teams.filter(u => u.city === t.city).length > 1).map(t => t.city));
  let out = title;
  const swap = (re: RegExp, t: TeamRow) => { out = out.replace(re, (_m, pre: string) => `${pre}${t.name}`); };
  // Boundaries: start or a non-letter before, and a non-letter (or end) after.
  const B = "(^|[^A-Za-z])", E = "(?![A-Za-z])";
  for (const t of teams) swap(new RegExp(`${B}${cityRe(t.city)}\\s+${esc(t.name)}${E}`, "gi"), t);
  for (const t of teams) if (shared.has(t.city)) swap(new RegExp(`${B}${cityRe(t.city)}\\s+${esc(t.name[0]!)}${E}`, "g"), t);
  for (const t of teams) if (!shared.has(t.city) && t.city !== t.name) swap(new RegExp(`${B}${cityRe(t.city)}(?!\\s+${esc(t.name)})${E}`, "g"), t);
  return out;
}

/** A game under way: started, and no more than LIVE_MS ago. */
export const LIVE_MS = 4 * 3_600_000;
export const isLive = (startAt: number | null | undefined, now: number): boolean => startAt != null && startAt <= now && now - startAt < LIVE_MS;
