/* When a spread or total has no exact Kalshi twin: the nearest lines Kalshi does list for that game, one on each side
 * where it has them, clearly labelled as alternatives ("Kalshi doesn't list 213.5. Kalshi has 212.5 and 214.5."). Never
 * a twin, never a ping: a different line is a different bet. The game comes from the market's URL (league, teams,
 * date), the line and side from its title. Kalshi's event is read live, cached 5 minutes. Server only. */
import { KalshiClient } from "@/lib/exchanges";
import { memo } from "@/lib/memo";
import type { VMarket } from "@/lib/types";
import { TEAMS, type League } from "@/lib/matching/aliases";
import { gameTickers } from "./direct";

export interface NearLine { line: number; title: string; url: string; yes: number | null }
export interface Nearest { kind: "spread" | "total"; line: number; team: string | null; alternatives: NearLine[] }

/** "Heat vs. Lakers: O/U 259.5" → total 259.5; "Spread: Lakers (-7.5)" → Lakers spread 7.5. Pure. */
export function lineOf(title: string): { kind: "spread" | "total"; line: number; team: string | null } | null {
  const t = /O\/U\s+(\d+(?:\.\d+)?)/i.exec(title);
  if (t) return { kind: "total", line: Number(t[1]), team: null };
  const s = /Spread:\s*(.+?)\s*\(\s*[-−]\s*(\d+(?:\.\d+)?)\s*\)/i.exec(title);
  return s ? { kind: "spread", line: Number(s[2]), team: s[1]!.trim() } : null;
}

/** The Kalshi line nearest below and above `line` (one each, when listed). For a spread, only the same team's lines. Pure. */
export function nearestLines(markets: readonly VMarket[], want: { kind: "spread" | "total"; line: number; teamCode: string | null }): NearLine[] {
  const lines = markets.filter(m => typeof m.ids?.floorStrike === "number" && m.ids?.strikeType === "greater")
    .filter(m => want.kind === "total" || (want.teamCode !== null && m.id.slice(m.eventId.length + 1).replace(/\d+$/, "") === want.teamCode))
    .map(m => ({ line: m.ids!.floorStrike as number, title: m.title, url: m.url, yes: m.yesPrice ?? null }))
    .filter(x => x.line !== want.line);
  const below = lines.filter(x => x.line < want.line).sort((a, b) => b.line - a.line)[0];
  const above = lines.filter(x => x.line > want.line).sort((a, b) => a.line - b.line)[0];
  return [below, above].filter((x): x is NearLine => Boolean(x));
}

const kalshi = new KalshiClient();

/** The nearest Kalshi lines for a Polymarket spread or total, or null (not a game, not a line, or Kalshi has none). */
export async function nearestKalshi(url: string | null, title: string): Promise<Nearest | null> {
  const slug = /\/event\/([^/?#]+)/.exec(url ?? "")?.[1] ?? "";
  const want = lineOf(title);
  const league = /^(nba|nfl|mlb|nhl)-/.exec(slug)?.[1] as League | undefined;
  if (!want || !league) return null;
  const teamCode = want.team ? TEAMS[league].find(r => r.name.toLowerCase() === want.team!.toLowerCase() || `${r.city} ${r.name}`.toLowerCase() === want.team!.toLowerCase())?.abbr[0] ?? null : null;
  if (want.kind === "spread" && !teamCode) return null;
  const markets = await memo(`kalshi:near:${slug}:${want.kind}`, 5 * 60_000, async () => {
    for (const t of gameTickers(slug)) {
      const ev = await kalshi.getEvent(t.replace("GAME-", want.kind === "total" ? "TOTAL-" : "SPREAD-")).catch(() => null);
      if (ev?.markets.length) return ev.markets;
    }
    return [] as VMarket[];
  }).catch(() => [] as VMarket[]);
  const alternatives = nearestLines(markets, { kind: want.kind, line: want.line, teamCode });
  return alternatives.length ? { kind: want.kind, line: want.line, team: want.team, alternatives } : null;
}
