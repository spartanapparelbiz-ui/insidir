/* When a market is decided, there is nothing left to copy: it settled (won, lost or void), the venue closed it, or the
 * side's price is 97¢ or more (all but won) or 3¢ or less (all but lost). Rows, the price chart and the copy ticket
 * show "Decided" with the result instead of Copy. Pure. */
export type Decision = "won" | "lost" | "void" | "closed";
export const DECIDED_HI = 0.97, DECIDED_LO = 0.03;

export function decision(b: { result?: string | null; closed?: boolean | null; priceNow: number | null }): Decision | null {
  if (b.result === "won" || b.result === "lost" || b.result === "void") return b.result;
  if (b.priceNow !== null && b.priceNow >= DECIDED_HI) return "won";
  if (b.priceNow !== null && b.priceNow <= DECIDED_LO) return "lost";
  if (b.closed) return "closed";
  return null;
}

/** "Decided · Hawks won", "Decided · No lost", "Decided · void", "Decided". */
export function decidedText(d: Decision, outcome: string | null): string {
  if (d === "void") return "Decided · void";
  if (d === "closed") return "Decided";
  return `Decided · ${outcome ?? (d === "won" ? "their side" : "their side")} ${d}`;
}
