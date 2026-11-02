/* Everything the visitors' home page shows, read in parallel (server only). A part that fails or has no data comes back
 * empty and its section is left out (components/sky/Landing.tsx). Chips are the busiest live market in each category,
 * deduplicated by what they say. The ticker is the newest of the skyline's bets. */
import type { Db } from "@/lib/db";
import { memo } from "@/lib/memo";
import { bestTracker, CATS, chipText, electionMode, marketCards, recordWindows, type Cat, type Clients, type MarketCard, type Proof, type RecordRow, type RecordWindow } from "@/lib/nx/data";
import { featuredRead, type Featured } from "@/lib/nx/featured";
import { skyBets, type SkyBet } from "./skyline";

export interface LandingData {
  now: number; election: boolean; us: boolean;
  sky: SkyBet[]; chips: MarketCard[]; proof: Proof | null;
  cards: Partial<Record<Cat, MarketCard[]>>; featured: Featured | null; ticker: SkyBet[];
  record: Record<RecordWindow, RecordRow[]>;
}

const EMPTY_RECORD = (): Record<RecordWindow, RecordRow[]> => ({ "1w": [], "1m": [], "3m": [], all: [] });

/** Up to n chips, one per distinct name, busiest first. */
export function dedupeChips(cards: readonly MarketCard[], n = 5): MarketCard[] {
  const seen = new Set<string>(), out: MarketCard[] = [];
  for (const c of cards) { const k = chipText(c).toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(c); } }
  return out.slice(0, n);
}

export async function landingData(db: Db, clients: Clients, now: number, us: boolean): Promise<LandingData> {
  const cardsJob = memo("sky:landing:cards", 60_000, async () => {
    const lists = await Promise.all(CATS.map(c => marketCards(db, now, { cat: c.key, limit: 8 }).catch(() => [] as MarketCard[])));
    return Object.fromEntries(CATS.map((c, i) => [c.key, lists[i]!]).filter(([, l]) => (l as MarketCard[]).length)) as Partial<Record<Cat, MarketCard[]>>;
  });
  const [sky, cards, proof, featured, record] = await Promise.all([
    memo("sky:landing:sky", 20_000, () => skyBets(db, now)).catch(() => [] as SkyBet[]),
    cardsJob.catch((): Partial<Record<Cat, MarketCard[]>> => ({})),
    memo("sky:landing:proof", 5 * 60_000, () => bestTracker(db, now)).catch(() => null),
    featuredRead(db, clients, now).catch(() => null),
    memo("sky:landing:record", 5 * 60_000, () => recordWindows(db, now, 6)).catch(EMPTY_RECORD),
  ]);
  // Chips: the busiest market of each category first, then the next busiest, deduplicated by their words.
  const firsts = CATS.flatMap(c => cards[c.key]?.slice(0, 1) ?? []), rest = CATS.flatMap(c => cards[c.key]?.slice(1) ?? []);
  const ticker = [...sky].sort((a, b) => b.at - a.at).slice(0, 18);
  return { now, election: electionMode(now), us, sky, chips: dedupeChips([...firsts, ...rest]), proof, cards, featured, ticker, record };
}
