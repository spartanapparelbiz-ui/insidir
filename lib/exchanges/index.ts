/* The venue clients behind one interface. The worker sweeps every venue with listMarkets / listEvents and refreshes
 * books with getBooks (priority "hot" for markets with live opportunities). */
import type { Venue } from "@/lib/types";
import { KalshiClient } from "./kalshi";
import { PolymarketClient } from "./polymarket";
import { PolymarketUsClient } from "./polymarket-us";
import type { VenueClient } from "./venue";

export type { VenueClient } from "./venue";
export { rateLimitStats } from "./http";
export { KalshiClient } from "./kalshi";
export { PolymarketClient } from "./polymarket";
export { PolymarketUsClient } from "./polymarket-us";

/** One client per venue (process-wide, sharing the per-venue rate limiters). */
export function createVenueClients(): Record<Venue, VenueClient> {
  return {
    kalshi: new KalshiClient(),
    polymarket: new PolymarketClient(),
    polymarket_us: new PolymarketUsClient(),
  };
}
