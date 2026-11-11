/* Copy-trading pushes, pure (lib/copies/alert-store.ts reads the database; worker copy:alerts sends them):
 *   entry   a wallet the member follows trades (a buy of $1K+): "[tag], up $X, opened $size on [market] at [price].", then sizing and
 *           the cheaper venue when Kalshi lists it too. Opens the copy ticket.
 *   exit    the wallet a member copied sells or trims that position: "[tag] closed [market] at 84¢. Result: +9%. You
 *           entered at 77¢." Opens the market on the member's venue, to close in one tap.
 *   drop    the price falls their set number of cents below their entry. Opens the market the same way.
 * Information, not advice: sizes are matched sizes. The wallet is its short address and profit, never a name. */
import { dollars } from "@/lib/money";
import { pctText, SIZE_LABEL, type YourSize } from "./sizing";
import { shortWallet } from "@/lib/millionaires/watchlist";

const cents = (p: number) => `${Math.round(p * 100)}¢`;
export interface Msg { title: string; body: string; url: string }

export interface EntryTrade { id: string; wallet: string; pnl: number | null; verified: boolean; title: string; outcome: string; amount: number; price: number }
export interface VenuePrices { polymarket: number | null; kalshi: number | null }

/** The cheaper venue for the side, when both have a price; ties go to Kalshi (no account outside the US needed in the US). */
export function cheaper(p: VenuePrices): "kalshi" | "polymarket" | null {
  if (p.polymarket === null && p.kalshi === null) return null;
  if (p.kalshi === null) return "polymarket";
  if (p.polymarket === null) return "kalshi";
  return p.kalshi <= p.polymarket ? "kalshi" : "polymarket";
}

/** "[Wallet tag], up $[X]M, opened $[size] on [market] at [price]." then the member's sizing and the cheaper venue. */
export function entryMessage(t: EntryTrade, size: YourSize | null, prices: VenuePrices, appUrl: string): Msg {
  const tag = `${t.verified ? "Verified " : ""}${shortWallet(t.wallet)}`;
  const up = t.pnl !== null && t.pnl > 0 ? `, up ${dollars(t.pnl)}` : "";
  const c = cheaper(prices);
  const where = prices.kalshi !== null && prices.polymarket !== null
    ? ` Kalshi ${cents(prices.kalshi)}, Polymarket ${cents(prices.polymarket)}: ${c === "kalshi" ? "Kalshi" : "Polymarket"} is cheaper.` : "";
  const sizing = size ? ` Sizing: $${size.yours.toLocaleString("en-US")}, ${pctText(size.theirPct)} of your bankroll, as they put in ${pctText(size.theirPct)} of theirs (${SIZE_LABEL}).`
    : " Set your bankroll in Account to get sizing.";
  return { title: "Signal", body: `${tag}${up}, opened ${dollars(t.amount)} on ${t.outcome} in “${t.title}” at ${cents(t.price)}.${sizing}${where}`, url: `${appUrl}/copy/${encodeURIComponent(t.id)}` };
}

export interface ExitEvent { id: string; kind: "trim" | "exit"; sold: number; price: number }
export interface CopyRef { id: number; outcome: string; title: string; entry: number }

/** "[Wallet tag] closed [market] at [price]. Result: [+/-X]%." (a trim: "sold 60% of"); the result is the exit price
 *  against the member's entry. Opens the market on the member's venue. */
export function exitMessage(e: ExitEvent, c: CopyRef, appUrl: string, wallet?: string | null): Msg {
  const tag = wallet ? shortWallet(wallet) : "The wallet you copied";
  const what = e.kind === "exit" || e.sold >= 0.995 ? "closed" : `sold ${Math.round(e.sold * 100)}% of`;
  const r = c.entry > 0 ? Math.round(((e.price - c.entry) / c.entry) * 100) : null;
  return { title: "Exit signal", body: `${tag} ${what} ${c.outcome} in “${c.title}” at ${cents(e.price)}.${r !== null ? ` Result: ${r >= 0 ? "+" : "−"}${Math.abs(r)}%.` : ""} You entered at ${cents(c.entry)}.`,
    url: `${appUrl}/api/copies/open?id=${c.id}` };
}

/** A price-drop push is due when the side's price now is `dropCents` or more under the member's entry. */
export const dropDue = (entry: number, now: number | null, dropCents: number | null): boolean => dropCents !== null && now !== null && Math.round((entry - now) * 100) >= dropCents;

export function dropMessage(c: CopyRef, now: number, appUrl: string): Msg {
  return { title: "Price signal", body: `${c.outcome} (“${c.title}”) is at ${cents(now)}, ${Math.round((c.entry - now) * 100)}¢ under your ${cents(c.entry)} entry.`, url: `${appUrl}/api/copies/open?id=${c.id}` };
}
