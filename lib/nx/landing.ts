/* Everything the visitors' home page shows, read in parallel (server only). A part that fails or has no data comes back
 * empty, and its section is left out (components/nx/Landing.tsx). */
import type { Db } from "@/lib/db";
import { memo } from "@/lib/memo";
import type { PhotoName } from "@/lib/photos";
import { bestTracker, CATS, electionMode, marketCards, recordWindows, suggestionChips, tickerBets, withSparks, type Cat, type Clients, type MarketCard, type RecordRow, type RecordWindow } from "./data";
import { featuredRead } from "./featured";
import type { LandingData } from "@/components/nx/Landing";

/** The hero's photo: the election photo until the polls close, the sports photo after (lib/photos.ts, licensed and
 *  credited on /credits). */
export const heroPhoto = (now: number): PhotoName => (electionMode(now) ? "elections-2026" : "home-sports");

const EMPTY_RECORD = (): Record<RecordWindow, RecordRow[]> => ({ "1w": [], "1m": [], "3m": [], all: [] });

export async function landingData(db: Db, clients: Clients, now: number, us: boolean): Promise<LandingData> {
  // Cards change slowly: one query set per minute, shared by every visitor.
  const cardsJob = memo("nx:landing:cards", 60_000, async () => {
    const lists = await Promise.all(CATS.map(c => marketCards(db, now, { cat: c.key, limit: 8 }).catch(() => [] as MarketCard[])));
    return Object.fromEntries(CATS.map((c, i) => [c.key, lists[i]!])) as Record<Cat, MarketCard[]>;
  });
  const [chips, proof, cards, featured, ticker, record] = await Promise.all([
    memo("nx:landing:chips", 60_000, () => suggestionChips(db, now)).catch(() => [] as MarketCard[]),
    memo("nx:landing:proof", 5 * 60_000, () => bestTracker(db, now)).catch(() => null),
    cardsJob.catch(() => Object.fromEntries(CATS.map(c => [c.key, [] as MarketCard[]])) as Record<Cat, MarketCard[]>),
    featuredRead(db, clients, now).catch(() => null),
    tickerBets(db, now).catch(() => []),
    memo("nx:landing:record", 5 * 60_000, () => recordWindows(db, now)).catch(EMPTY_RECORD),
  ]);
  await withSparks(Object.values(cards).flat(), clients.polymarket, now).catch(() => undefined);
  return { now, election: electionMode(now), photo: heroPhoto(now), chips, proof, cards, featured, ticker, record, us };
}
