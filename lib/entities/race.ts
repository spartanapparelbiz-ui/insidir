/* Races as their own pages (server only). A race is one event (a Senate seat, a governorship, control of a chamber) with
 * a market per candidate; its address is Polymarket's event slug (/race/florida-governor-election-winner), or, for a race
 * we only know by one market, that market's slug. Every race the election board knows has a page; visitors get the same
 * three races whole as on /election, and the rest with the money per candidate locked. */
import type { Db } from "@/lib/db";
import { memo } from "@/lib/memo";
import { electionDay, type RaceCard } from "@/lib/market/races";
import { racePath, raceSlugOf } from "./slug";

const raceSlug = (r: RaceCard): string => raceSlugOf(r.key, r.title);
export const raceHref = (r: RaceCard): string => racePath(raceSlug(r));

/** Every race (members' order: control first, then by money), and the keys a visitor gets whole. Cached a minute. */
export function allRaces(db: Db, now: number): Promise<{ races: RaceCard[]; free: Set<string> }> {
  return memo("entity:races", 60_000, async () => {
    // Settled races keep their pages (with the result): the last 90 days, open or not.
    const [all, visitor] = await Promise.all([electionDay(db, now, true, true), electionDay(db, now, false, true)]);
    return { races: all.races, free: new Set(visitor.races.map(r => r.key)) };
  });
}

export async function raceBySlug(db: Db, slug: string, now: number): Promise<{ race: RaceCard; others: RaceCard[]; free: boolean; redirect: string | null } | null> {
  const { races, free } = await allRaces(db, now);
  const s = decodeURIComponent(slug).toLowerCase();
  let race = races.find(r => raceSlug(r).toLowerCase() === s);
  // A slug that changed (Polymarket renames events: "florida-governor-winner-2026" vs "…-election-winner"): the one
  // race with the same words, sent to its page.
  if (!race) { const want = slugWords(s); const hits = races.filter(r => slugWords(raceSlug(r)) === want); if (hits.length === 1) race = hits[0]; }
  if (!race) return null;
  const canonical = raceSlug(race);
  return { race, others: races.filter(r => r !== race), free: free.has(race.key), redirect: canonical.toLowerCase() === s ? null : racePath(canonical) };
}

const STOP = new Set(["election", "elections", "winner", "race", "the", "who", "will", "win", "of", "2026", "2025", "2027", "general", "midterm", "midterms"]);
/** A race slug's words without the noise ("florida-governor-winner-2026" → "florida governor"). Pure. */
function slugWords(slug: string): string {
  return slug.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w) && !/^[0-9a-f]{6}$/.test(w)).sort().join(" ");
}
