/* Where a visitor came from (?ref=, kept first-touch in the insidir_ref cookie by middleware.ts), for attribution
 * only: the landing_view event and, when no utm_source was given, the account's UTM source. The home page is the same
 * for everyone. */

export const REF_COOKIE = "insidir_ref";

/** A ref as we store it: lower case, letters, digits, dot, dash and underscore, at most 40; anything else is ignored. */
export function cleanRef(raw: string | null | undefined): string | null {
  const r = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{2,40}$/.test(r) ? r : null;
}
