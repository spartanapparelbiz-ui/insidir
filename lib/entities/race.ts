/* Races as their own pages (server only). A race is one event (a Senate seat, a governorship, control of a chamber) with
 * a market per candidate; its address is Polymarket's event slug (/race/florida-governor-election-winner), or, for a race
 * we only know by one market, that market's slug. Every race the election board knows has a page; visitors get the same
 * three races whole as on /election, and the rest with the money per candidate locked. */
import type { Db } from "@/lib/db";
import { memo } from "@/lib/memo";
import { electionDay, type RaceCard } from "@/lib/market/races";
import { racePath, raceSlugOf } from "./slug";

export const raceSlug = (r: RaceCard): string => raceSlugOf(r.key, r.title);
export const raceHref = (r: RaceCard): string => racePath(raceSlug(r));

/** Every race (members' order: control first, then by money), and the keys a visitor gets whole. Cached a minute. */
export function allRaces(db: Db, now: number): Promise<{ races: RaceCard[]; free: Set<string> }> {
  return memo("entity:races", 60_000, async () => {
    const [all, visitor] = await Promise.all([electionDay(db, now, true), electionDay(db, now, false)]);
    return { races: all.races, free: new Set(visitor.races.map(r => r.key)) };
  });
}

export async function raceBySlug(db: Db, slug: string, now: number): Promise<{ race: RaceCard; others: RaceCard[]; free: boolean } | null> {
  const { races, free } = await allRaces(db, now);
  const s = decodeURIComponent(slug).toLowerCase();
  const race = races.find(r => raceSlug(r).toLowerCase() === s);
  return race ? { race, others: races.filter(r => r !== race), free: free.has(race.key) } : null;
}
