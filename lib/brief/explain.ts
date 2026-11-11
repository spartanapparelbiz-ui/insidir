/* "What this means for me": the one plain line under every board row, alert and brief item, computed in code from
 * what the row already has (never by a model). Pure; safe on the client.
 *   member, open    "At 52¢: $100 pays $192 if Yes wins. 3.1× this wallet's usual bet." ("if Lakers win" for a team)
 *   member, settled "It won: $100 at 52¢ paid $192." / "It lost: $100 at 52¢ paid $0."
 *   visitor         no side and no side's price (either would give the side away): "A $48K bet, 3.1× this wallet's
 *                   usual." / "A $48K bet from a wallet up $2.4M."
 * Information, not advice: it says what the price pays, never what to do. */
import { dollars } from "@/lib/money";
import { cents, payout } from "@/lib/briefing/math";

export interface ExplainInput {
  outcome: string | null;
  side: "yes" | "no" | null;
  amount: number;
  priceThen: number | null;
  priceNow: number | null;
  result: "won" | "lost" | "void" | null;
  /** The wallet's usual (median) bet; null or absent when we don't know it. */
  usual?: number | null;
  /** The wallet's all-time profit (the watchlist's). */
  pnl?: number | null;
}

const tradable = (p: number | null | undefined): p is number => typeof p === "number" && p > 0.005 && p < 0.995;

/** "3.1× this wallet's usual bet", "about this wallet's usual bet", "smaller than this wallet's usual bet"; null without one. */
export function usualText(amount: number, usual: number | null | undefined): string | null {
  if (!usual || usual <= 0 || !(amount > 0)) return null;
  const x = Math.round((amount / usual) * 10) / 10;
  if (x >= 1.5) return `${x}× this wallet's usual trade`;
  if (x >= 0.7) return "about this wallet's usual trade";
  return "smaller than this wallet's usual trade";
}

/** "if Yes wins", "if Lakers win" (a team's plural name), "if Over wins". */
export function winsIf(outcome: string): string {
  const o = outcome.trim();
  if (/^(yes|no)$/i.test(o)) return `if ${o[0]!.toUpperCase()}${o.slice(1).toLowerCase()} wins`;
  // A team's plural name reads "if the Chiefs win": a last word ending in s (not ss), like Chiefs, Lakers, Bills.
  return /[^s]s$/i.test(o) && !/\d/.test(o) ? `if ${o} win` : `if ${o} wins`;
}

/** The explanation line for a bet as this viewer may see it (a visitor's row has no side). */
export function betExplain(b: ExplainInput): string | null {
  const usual = usualText(b.amount, b.usual);
  // A visitor: no side, no price of the side.
  if (!b.outcome || !b.side) {
    if (usual) return `A ${dollars(b.amount)} trade, ${usual.replace(" trade", "")}.`;
    if (b.pnl && b.pnl > 0) return `A ${dollars(b.amount)} trade from a wallet up ${dollars(b.pnl)}.`;
    return null;
  }
  if (b.result === "won" || b.result === "lost") {
    if (!tradable(b.priceThen)) return null;
    const p = payout(b.priceThen);
    return b.result === "won" ? `It won: $100 at ${cents(b.priceThen)} paid ${dollars(p.pays)}.` : `It lost: $100 at ${cents(b.priceThen)} paid $0.`;
  }
  if (b.result === "void") return "The market was voided: the money went back.";
  const price = tradable(b.priceNow) ? b.priceNow : tradable(b.priceThen) ? b.priceThen : null;
  const parts: string[] = [];
  if (price !== null) parts.push(`At ${cents(price)}${price === b.priceNow ? " now" : ""}: $100 pays ${dollars(payout(price).pays)} ${winsIf(b.outcome)}.`);
  if (usual) parts.push(`${usual[0]!.toUpperCase()}${usual.slice(1)}.`);
  return parts.length ? parts.join(" ") : null;
}

/** The second sentence of a ping: what it means, from the ping's own numbers. */
export function pingExplain(b: { outcome: string; price: number; amount: number; kind?: "open" | "add" | "trim" | "exit"; usual?: number | null }, priceNow: number | null): string | null {
  if (b.kind === "trim" || b.kind === "exit") return `What it means: money that was on ${b.outcome} is leaving at ${cents(b.price)}.`;
  const price = tradable(priceNow) ? priceNow : tradable(b.price) ? b.price : null;
  if (price === null) return null;
  const usual = usualText(b.amount, b.usual);
  return `What it means: at ${cents(price)}, $100 pays ${dollars(payout(price).pays)} ${winsIf(b.outcome)}${usual ? `; ${usual}` : ""}.`;
}
