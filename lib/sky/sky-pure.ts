/* The big-bet pure parts, safe in the browser: the bet type and the one-line description of a bet (the landing's
 * marquee and the board use these). */
import type { Art } from "./art";

/** Initials for a monogram: "Haley Stevens" → "HS", "Rams" → "RA", "KC" → "KC". */
export function initials(name: string): string {
  const w = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (w.length >= 2) return `${w[0]![0]}${w[w.length - 1]![0]}`.toUpperCase();
  return (w[0] ?? "?").slice(0, 2).toUpperCase();
}


export interface SkyBet {
  id: string; venue: "polymarket" | "kalshi"; marketId: string;
  amount: number; side: string; price: number; at: number; title: string;
  /** The imagery for its sprite (the 8 biggest) and its ticker row. */
  art: Art;
}

/** "4m ago", "2h ago", "just now". */
export function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** "$139,771 · Rams · 69¢ · Chargers vs. Rams · 4m ago": one bet in words, for the tooltip and the ticker. */
export const betLine = (b: Pick<SkyBet, "amount" | "side" | "price" | "title" | "at">, now: number, withTitle = true): string =>
  [`$${Math.round(b.amount).toLocaleString("en-US")}`, b.side, `${Math.round(b.price * 100)}¢`, withTitle && b.title !== b.side ? b.title : null, ago(b.at, now)].filter(Boolean).join(" · ");
