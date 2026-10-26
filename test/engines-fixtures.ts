/* Synthetic markets and books for the engine tests. */
import type { Book, FeeModel, Level, MarketPair, VMarket, Venue } from "@/lib/types";

export const NOW = Date.UTC(2026, 9, 25);
export const DAY = 86_400_000;
export const ZERO_PM: FeeModel = { venue: "polymarket", rate: 0 };

export function market(over: Partial<VMarket> & { id: string }): VMarket {
  return {
    venue: "kalshi",
    eventId: "EV",
    seriesId: null,
    title: `Market ${over.id}`,
    eventTitle: null,
    yesLabel: "Yes",
    noLabel: "No",
    rules: "",
    resolutionSource: null,
    closeTime: NOW + 10 * DAY,
    category: "economics",
    fee: { venue: "kalshi", multiplier: 1 },
    url: `https://example.test/${over.id}`,
    yesTokenId: null,
    noTokenId: null,
    strike: null,
    active: true,
    result: null,
    volume24h: null,
    ...over,
  };
}

export function book(over: Partial<Book> = {}): Book {
  return { yesAsks: [], noAsks: [], yesBids: [], noBids: [], fetchedAt: NOW, hash: null, ...over };
}

export const L = (price: number, size: number): Level => ({ price, size });

export function pair(a: VMarket, b: VMarket, over: Partial<MarketPair> = {}): MarketPair {
  return {
    id: `${a.venue}:${a.id}|${b.venue}:${b.id}`,
    a: { venue: a.venue, id: a.id },
    b: { venue: b.venue, id: b.id },
    inverted: false,
    method: "deterministic",
    confidence: 1,
    safety: "green",
    safetyNotes: [],
    blocked: false,
    ...over,
  };
}

export function key(venue: Venue, id: string): string {
  return `${venue}:${id}`;
}
