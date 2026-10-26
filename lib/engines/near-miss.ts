/* The closest a matched pair came to being a deal: for each pair of venues, the cheapest way to buy both sides of a
 * matched market at the top of the book right now. Shown on the landing page when there is no deal to show, labelled
 * honestly ("Not a deal yet: 101¢ in."). Pure. Only matched, unblocked, green pairs with both markets active count:
 * a pair whose rules differ isn't a near miss, it's a different question. */
import type { Side, Venue } from "../types";
import { arbDirections, arbInputUsable, type ArbInput } from "./arb";
import { venueSideLabel } from "./common";

export interface NearMiss {
  /** The two venues, sorted: one near miss is kept per venue pair so each region can be shown its own. */
  venues: [Venue, Venue];
  pairId: string;
  title: string;
  legs: Array<{ venue: Venue; marketId: string; side: Side; label: string; priceCents: number }>;
  /** Both best asks added up, in cents. 100 or more is no lock even before fees. */
  totalCents: number;
  /** When the books were read. */
  at: number;
}

const bestAsk = (b: ArbInput["bookA"], side: Side): number | null => (side === "yes" ? b.yesAsks : b.noAsks)[0]?.price ?? null;
const cents = (p: number): number => Math.round(p * 1000) / 10;

export function findNearMisses(inputs: readonly ArbInput[]): NearMiss[] {
  const best = new Map<string, NearMiss>();
  for (const input of inputs) {
    if (!arbInputUsable(input) || input.pair.safety !== "green") continue;
    const { pair, a, b, bookA, bookB } = input;
    for (const [sa, sb] of arbDirections(pair.inverted)) {
      const pa = bestAsk(bookA, sa), pb = bestAsk(bookB, sb);
      if (pa === null || pb === null || pa <= 0 || pb <= 0) continue;
      const venues = [a.venue, b.venue].sort() as [Venue, Venue];
      const key = venues.join("|");
      const total = Math.round((pa + pb) * 1000) / 10;
      const prev = best.get(key);
      if (prev && prev.totalCents <= total) continue;
      best.set(key, {
        venues, pairId: pair.id, title: a.eventTitle && a.eventTitle !== a.title ? `${a.eventTitle}: ${a.title}` : a.title,
        legs: [
          { venue: a.venue, marketId: a.id, side: sa, label: venueSideLabel(a, sa), priceCents: cents(pa) },
          { venue: b.venue, marketId: b.id, side: sb, label: venueSideLabel(b, sb), priceCents: cents(pb) },
        ],
        totalCents: total, at: Math.max(bookA.fetchedAt, bookB.fetchedAt),
      });
    }
  }
  return [...best.values()].sort((x, y) => x.totalCents - y.totalCents);
}
