/* The money skyline's pure parts, safe in the browser: the bet type, the shared layout, bar heights and the one-line
 * description of a bet. The 3D scene, its SVG fallback and the ticker all use these. */
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

/** Where each bar stands on the floor: a golden-angle spiral, index 0 (the biggest) at the centre. Units: the floor's
 *  radius is about `spread`. */
export function skyLayout(n: number, spread = 10): Array<{ x: number; z: number }> {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return { x: 0, z: 0 };
    const r = spread * Math.sqrt(i / Math.max(1, n - 1)), a = i * golden;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
}

/** A bar's height from its dollars: log-scaled between the day's smallest and biggest, so a $1M bet doesn't flatten the
 *  rest. Between `lo` and `hi` scene units. */
export function barHeight(amount: number, min: number, max: number, lo = 1, hi = 9): number {
  const l = (v: number) => Math.log10(Math.max(1, v));
  if (max <= min) return (lo + hi) / 2;
  return lo + ((l(amount) - l(min)) / (l(max) - l(min))) * (hi - lo);
}
