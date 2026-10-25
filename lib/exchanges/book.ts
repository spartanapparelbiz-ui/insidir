/* Order-book helpers shared by the venue clients: read price levels in any of the shapes the venues send, sort
 * them best-first, and drop junk. Prices are dollars per contract (0..1), sizes are contracts. Pure. */
import type { Book, Level } from "@/lib/types";
import { isObject, num, type JsonObject } from "./parse";

/** Prices are rounded to this many decimals after any arithmetic (1 − bid) to kill float noise (0.1 + 0.2). */
export const PRICE_DECIMALS = 6;

export const roundPrice = (p: number): number => Number(p.toFixed(PRICE_DECIMALS));

/** One level from [price, size] / ["0.45", "100.00"] / {price, size}; null when unreadable or empty. `scale`
 *  divides the price (100 for integer-cent fields). */
export function readLevel(v: unknown, scale = 1): Level | null {
  let p: number | null = null;
  let s: number | null = null;
  if (Array.isArray(v)) {
    p = num(v[0]);
    s = num(v[1]);
  } else if (isObject(v)) {
    const o: JsonObject = v;
    p = num(o.price ?? o.p);
    s = num(o.size ?? o.quantity ?? o.qty ?? o.count ?? o.s);
  }
  if (p === null || s === null) return null;
  const price = roundPrice(p / scale);
  if (!(price > 0 && price < 1) || !(s > 0)) return null;
  return { price, size: s };
}

export function readLevels(v: unknown, scale = 1): Level[] {
  if (!Array.isArray(v)) return [];
  const out: Level[] = [];
  for (const x of v) {
    const l = readLevel(x, scale);
    if (l) out.push(l);
  }
  return out;
}

/** Merge duplicate prices (sum sizes). */
function merge(levels: Level[]): Level[] {
  const m = new Map<number, number>();
  for (const l of levels) m.set(l.price, (m.get(l.price) ?? 0) + l.size);
  return [...m].map(([price, size]) => ({ price, size }));
}

/** Asks cheapest first. */
export const sortAsks = (levels: Level[]): Level[] => merge(levels).sort((a, b) => a.price - b.price);
/** Bids highest first. */
export const sortBids = (levels: Level[]): Level[] => merge(levels).sort((a, b) => b.price - a.price);

/** The complement side: a bid of p on one side is an ask of 1 − p on the other, same size. */
export const complement = (levels: Level[]): Level[] => levels.map(l => ({ price: roundPrice(1 - l.price), size: l.size }));

export function emptyBook(fetchedAt: number): Book {
  return { yesAsks: [], noAsks: [], yesBids: [], noBids: [], fetchedAt, hash: null };
}

/** A stable content hash of a book (FNV-1a over the levels), for change detection when the venue sends none. */
export function bookDigest(b: Pick<Book, "yesAsks" | "noAsks" | "yesBids" | "noBids">): string {
  const s = [b.yesAsks, b.noAsks, b.yesBids, b.noBids].map(side => side.map(l => `${l.price}:${l.size}`).join(",")).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
