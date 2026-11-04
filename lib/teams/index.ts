/* Teams on a market, from the team registry (lib/teams/registry.json, built by scripts/teams-sync.ts): the game comes
 * from the Polymarket event slug in the market's URL ("…/event/nba-phx-gsw-2026-11-02/…": league nba, teams phx and gsw),
 * never from the title, so a logo is never someone else's. A team in the registry without a usable logo, or one the
 * registry doesn't know, gets a monogram. LOGOS=off removes every team image at once. Pure. */
import registry from "./registry.json";

import type { TeamArt } from "./mark";
export type { TeamArt } from "./mark";
interface RegTeam { abbr: string; name: string; short: string; color: string; logo: string | null; dark: boolean }

const REG = registry as unknown as { leagues: Record<string, { label: string; teams: RegTeam[] }> };
const INDEX = new Map<string, RegTeam>();
for (const [league, l] of Object.entries(REG.leagues)) for (const t of l.teams) INDEX.set(`${league}:${t.abbr}`, t);

export const LEAGUES = Object.keys(REG.leagues);
export const leagueLabel = (league: string) => REG.leagues[league]?.label ?? league.toUpperCase();
export const logosOff = (): boolean => (process.env.LOGOS ?? "").toLowerCase() === "off";

/** Every team in the registry, by league (for /admin/art). */
export function allTeams(): Array<{ league: string; label: string; teams: TeamArt[] }> {
  return Object.entries(REG.leagues).map(([league, l]) => ({ league, label: l.label, teams: l.teams.map(t => art(league, t)) }));
}

const art = (league: string, t: RegTeam): TeamArt => ({ league, abbr: t.abbr, name: t.name, short: t.short, color: t.color, logo: logosOff() ? null : t.logo, dark: t.dark });

/** "https://polymarket.com/event/nba-phx-gsw-2026-11-02/nba-phx-gsw-2026-11-02-total-224pt5" → nba, phx, gsw. */
export function gameOf(urlOrSlug: string | null | undefined): { league: string; a: string; b: string } | null {
  const slug = /\/event\/([^/?#]+)/.exec(urlOrSlug ?? "")?.[1] ?? urlOrSlug ?? "";
  const m = /^([a-z0-9]+)-([a-z0-9]+)-([a-z0-9]+)-\d{4}-\d{2}-\d{2}/.exec(slug);
  return m && REG.leagues[m[1]!] ? { league: m[1]!, a: m[2]!, b: m[3]! } : null;
}

/** "Suns vs. Warriors" → ["Suns", "Warriors"] (the slug's order). */
const sides = (title: string | null | undefined): [string, string] | null => {
  const m = /^(.+?)\s+(?:vs\.?|@|v)\s+(.+?)(?::|\?|$)/i.exec((title ?? "").replace(/^Will\s+/i, ""));
  return m ? [m[1]!.trim(), m[2]!.trim()] : null;
};

/** The two teams of the game a market is on, in the slug's order; null when it isn't a game we know. */
export function matchupFor(url: string | null | undefined, title?: string | null): [TeamArt, TeamArt] | null {
  const g = gameOf(url);
  if (!g) return null;
  const names = sides(title);
  const one = (abbr: string, i: 0 | 1): TeamArt => {
    const t = INDEX.get(`${g.league}:${abbr}`);
    if (t) return art(g.league, t);
    const name = names?.[i] ?? abbr.toUpperCase();
    return { league: g.league, abbr, name, short: name, color: "#8a8a93", logo: null, dark: false };
  };
  return [one(g.a, 0), one(g.b, 1)];
}

export { monogram, discInk } from "./mark";
