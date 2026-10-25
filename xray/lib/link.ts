/* Reads a Polymarket link (or one of ours, after the domain swap) into what to X-ray.
 *
 *   https://polymarket.com/event/fed-decision-in-december            → event
 *   polymarket.com/event/fed-decision-in-december/fed-cuts-25bps      → event + market
 *   https://www.polymarket.com/es/event/x?tid=123#comments            → event (locale prefix, query and hash dropped)
 *   https://polymarket.com/market/will-x-happen                       → market
 *   https://insidir.com/event/x                                       → event (any host: the domain swap)
 *   fed-decision-in-december                                          → event (a bare slug)
 *
 * Anything else on polymarket.com with a slug-like last segment is read as an event slug. */

export type Target =
  | { kind: "event"; slug: string; market: string | null }
  | { kind: "market"; slug: string };

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/i;
const LOCALE = /^[a-z]{2}(?:-[a-z]{2,4})?$/i;
const RESERVED = new Set(["event", "market", "markets", "profile", "sports", "crypto", "search", "activity", "leaderboard", "portfolio"]);

const clean = (s: string): string | null => {
  let v: string;
  try { v = decodeURIComponent(s); } catch { return null; }
  v = v.trim().toLowerCase();
  return SLUG.test(v) ? v : null;
};

/** A route segment as a clean slug, or null (the page then 404s). */
export const slugParam = (segment: string): string | null => clean(segment);

export function parseLink(input: string): Target | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  // A bare slug: no slash, no dot, no spaces.
  if (!/[/.\s]/.test(raw)) {
    const slug = clean(raw);
    return slug ? { kind: "event", slug, market: null } : null;
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw.replace(/^\/+/, ""));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  let parts = url.pathname.split("/").filter(Boolean);
  if (parts.length && LOCALE.test(parts[0] ?? "") && !RESERVED.has((parts[0] ?? "").toLowerCase())) parts = parts.slice(1);
  if (!parts.length) return null;

  const head = (parts[0] ?? "").toLowerCase();
  if (head === "event") {
    const slug = parts[1] ? clean(parts[1]) : null;
    if (!slug) return null;
    const market = parts[2] ? clean(parts[2]) : null;
    return { kind: "event", slug, market };
  }
  if (head === "market") {
    const slug = parts[1] ? clean(parts[1]) : null;
    return slug ? { kind: "market", slug } : null;
  }
  if (head === "profile" || head === "search" || head === "leaderboard" || head === "portfolio" || head === "activity") return null;
  // Other polymarket.com paths (for example sports pages) end in the event's slug.
  const last = clean(parts[parts.length - 1] ?? "");
  return last ? { kind: "event", slug: last, market: null } : null;
}

/** Our own path for a target: polymarket.com paths, mirrored. */
export function targetPath(t: Target): string {
  if (t.kind === "market") return `/market/${encodeURIComponent(t.slug)}`;
  return `/event/${encodeURIComponent(t.slug)}${t.market ? "/" + encodeURIComponent(t.market) : ""}`;
}

/** The same page on Polymarket. */
export function polymarketUrl(t: Target): string {
  if (t.kind === "market") return `https://polymarket.com/market/${encodeURIComponent(t.slug)}`;
  return `https://polymarket.com/event/${encodeURIComponent(t.slug)}${t.market ? "/" + encodeURIComponent(t.market) : ""}`;
}
