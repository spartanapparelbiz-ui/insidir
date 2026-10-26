/* From a parsed link to what to show: one market's X-ray, or an event's list of markets. */
import type { Target } from "./link";
import { getEvent, getMarket } from "./polymarket";
import type { EventInfo, Market } from "./types";

export type Resolved =
  | { type: "market"; market: Market; event: EventInfo | null }
  | { type: "list"; event: EventInfo; markets: Market[] };

/** Open markets first, then by volume, biggest first. */
export const byVolume = (markets: readonly Market[]): Market[] =>
  [...markets].sort((a, b) => Number(a.closed) - Number(b.closed) || b.volume - a.volume);

export async function resolveTarget(t: Target): Promise<Resolved | null> {
  if (t.kind === "market") {
    const market = await getMarket(t.slug);
    return market ? { type: "market", market, event: null } : null;
  }
  const event = await getEvent(t.slug);
  if (t.market) {
    const inEvent = event?.markets.find(m => m.slug === t.market) ?? null;
    const market = inEvent ?? (await getMarket(t.market));
    return market ? { type: "market", market: withEvent(market, event), event } : null;
  }
  if (!event) {
    // A bare slug may be a market's own slug.
    const market = await getMarket(t.slug);
    return market ? { type: "market", market, event: null } : null;
  }
  const open = event.markets.filter(m => !m.closed);
  if (event.markets.length === 1 && event.markets[0]) return { type: "market", market: event.markets[0], event };
  if (open.length === 1 && open[0]) return { type: "market", market: open[0], event };
  if (!event.markets.length) return null;
  return { type: "list", event, markets: byVolume(event.markets) };
}

const withEvent = (m: Market, e: EventInfo | null): Market =>
  e ? { ...m, eventSlug: m.eventSlug ?? e.slug, eventTitle: m.eventTitle ?? e.title } : m;
