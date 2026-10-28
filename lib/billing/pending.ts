/* Someone who made their account on /start but hasn't paid yet: their email in a cookie for 30 days, so /start and
 * /login can say "Finish getting Insidir" with it filled in. Set by /api/checkout/start, cleared once they're in. */
export const PENDING_COOKIE = "insidir_pending";
export const PENDING_MAX_AGE_S = 30 * 86_400;

export function readPending(v: string | undefined): string | null {
  if (!v) return null;
  const e = v.trim().toLowerCase();
  return e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
