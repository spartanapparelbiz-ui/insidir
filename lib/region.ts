/* Which venues a user may see. US users see only venues legally available to them: Kalshi and Polymarket US.
 * The international Polymarket site is never shown or linked to them. A visitor who hasn't chosen gets the US set,
 * the more restrictive of the two. */
import type { Opportunity, Region, Venue } from "./types";

export const REGION_VENUES: Record<Region, readonly Venue[]> = {
  us: ["kalshi", "polymarket_us"],
  non_us: ["kalshi", "polymarket"],
};

export const DEFAULT_REGION: Region = "us";

/** The venues to show: the region's venues, narrowed by the user's own choice when they made one. */
export function allowedVenues(region: Region | null, chosen?: readonly Venue[]): Venue[] {
  const base = REGION_VENUES[region ?? DEFAULT_REGION];
  if (!chosen || !chosen.length) return [...base];
  return base.filter(v => chosen.includes(v));
}

/** An opportunity is visible only when every leg is on an allowed venue. */
export const venuesOk = (o: Pick<Opportunity, "legs">, venues: readonly Venue[]): boolean => o.legs.every(l => venues.includes(l.venue));
