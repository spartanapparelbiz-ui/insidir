/* "Watch my bet" alerts, pure. Each alert is one headline line and one "what this means for your bet" line with the
 * member's own numbers, plus the facts both were built from. Every number is computed here, never by the model.
 *   opposite  $1M+ wallets just bet the other side: how many, how much, how far up they are, their record this month
 *   exit      a wallet on their side sold part or all of its position, at what price, how long after buying
 *   move      the price of their side moved MOVE_MIN (5¢) or more since the last alert (or their entry)
 *   deadline  the market closes within DEADLINE_MS (24 hours), once
 * A wallet is only ever its tier and short address. Information, not advice: what happened and what it means for
 * their numbers, never what to do. */
import { cents, pnlNow, signed } from "@/lib/briefing/math";
import { dollars } from "@/lib/money";

export const MOVE_MIN = 0.05;
export const DEADLINE_MS = 24 * 3_600_000;

export type AlertKind = "opposite" | "exit" | "move" | "deadline";
export interface WatchAlert { kind: AlertKind; headline: string; meaning: string; facts: Record<string, string | number | null> }

/** The member's position as the alerts see it. sideLabel is the outcome's name ("Yes", "Chiefs"). */
export interface Held { title: string; side: "yes" | "no"; sideLabel: string; price: number; amount: number; shares: number }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "2h", "40m", "3d". */
export function shortSpan(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
/** A floor for "up $3M+": whole millions from $1M, else hundreds of thousands. */
export function upFloor(pnl: number): number {
  return pnl >= 1e6 ? Math.floor(pnl / 1e6) * 1e6 : Math.floor(Math.max(0, pnl) / 1e5) * 1e5;
}

/** "Your $100 on Yes at 62¢ is +$34 at 81¢ now." (their stake, entry, profit or loss, the price now) */
export function positionLine(h: Held, priceNow: number | null): string {
  if (priceNow === null) return `You hold ${dollars(h.amount)} on ${h.sideLabel} at ${cents(h.price)}: ${Math.floor(h.shares).toLocaleString("en-US")} shares that pay ${dollars(h.shares)} if ${h.sideLabel} wins.`;
  const p = pnlNow(h.shares, h.amount, priceNow);
  const where = Math.round(p.pnl) === 0 ? "even" : p.pnl > 0 ? `up ${dollars(p.pnl)}` : `down ${dollars(-p.pnl)}`;
  return `You're ${where} on your ${dollars(h.amount)} on ${h.sideLabel} at ${cents(h.price)}, with ${h.sideLabel} at ${cents(priceNow)} now.`;
}

export interface OppositeBet { wallet: string; short: string; amount: number; price: number; pnl: number | null }
/** $1M+ wallets bet the other side. `record`: their combined settled record in this category over the last 30 days. */
export function oppositeAlert(h: Held, otherLabel: string, bets: readonly OppositeBet[], record: { won: number; lost: number } | null, categoryName: string | null, priceNow: number | null): WatchAlert | null {
  if (!bets.length) return null;
  const wallets = [...new Set(bets.map(b => b.wallet))];
  const total = bets.reduce((a, b) => a + b.amount, 0);
  const pnls = bets.map(b => b.pnl).filter((p): p is number => p !== null && p > 0);
  const floor = pnls.length === bets.length && pnls.length ? upFloor(Math.min(...pnls)) : 0;
  const who = wallets.length === 1 ? `A wallet${floor ? ` up ${dollars(floor)}+` : ""} (${bets[0]!.short})` : `${plural(wallets.length, "wallet")}${floor ? ` up ${dollars(floor)}+` : ""}`;
  const rec = record && record.won + record.lost > 0
    ? ` ${wallets.length === 1 ? "It's" : "They're"} ${record.won}–${record.lost}${categoryName ? ` on ${categoryName.toLowerCase()}` : ""} this month.` : "";
  const headline = `${who} just traded ${otherLabel}, ${dollars(total)} total.${rec}`;
  const meaning = `That's money against your ${h.sideLabel}. ${positionLine(h, priceNow)}`;
  return { kind: "opposite", headline, meaning, facts: { wallets: wallets.length, total: Math.round(total), upFloor: floor || null, won: record?.won ?? null, lost: record?.lost ?? null, priceNow } };
}

export interface ExitEvent { wallet: string; walletName: string; kind: "trim" | "exit"; shares: number; heldBefore: number; amount: number; price: number; at: number; firstBuyAt: number | null }
/** How much of the position a sale was: "all", "half", "a third", or a percent. */
export function shareSold(sold: number, heldBefore: number): string {
  if (heldBefore <= 0) return "part";
  const f = sold / heldBefore;
  if (f >= 0.9) return "all";
  if (Math.abs(f - 0.5) <= 0.07) return "half";
  if (Math.abs(f - 1 / 3) <= 0.05) return "a third";
  if (Math.abs(f - 0.25) <= 0.04) return "a quarter";
  return `${Math.round(f * 100)}%`;
}
export function exitAlert(h: Held, e: ExitEvent, priceNow: number | null): WatchAlert {
  const part = shareSold(e.shares, e.heldBefore);
  const after = e.firstBuyAt !== null && e.at > e.firstBuyAt ? `, ${shortSpan(e.at - e.firstBuyAt)} after buying` : "";
  const headline = `${e.walletName} sold ${part === "all" ? "all of it" : part} at ${cents(e.price)}${after}: ${dollars(e.amount)} of ${h.sideLabel} out.`;
  const meaning = `That wallet was on your side. ${positionLine(h, priceNow)}`;
  return { kind: "exit", headline, meaning, facts: { sold: part, price: e.price, amount: Math.round(e.amount), afterMs: e.firstBuyAt !== null ? e.at - e.firstBuyAt : null, priceNow } };
}

/** The side's price moved MOVE_MIN or more since `from` (the last alert's price, or their entry). */
export function moveAlert(h: Held, from: number, priceNow: number, sinceMs: number | null): WatchAlert | null {
  const d = priceNow - from;
  if (Math.abs(d) < MOVE_MIN - 1e-9) return null;
  const since = sinceMs !== null ? ` in ${shortSpan(sinceMs)}` : "";
  const headline = `${h.sideLabel} ${d > 0 ? "rose" : "fell"} ${cents(Math.abs(d))}${since}: ${cents(from)} → ${cents(priceNow)} on "${h.title}".`;
  const p = pnlNow(h.shares, h.amount, priceNow);
  const meaning = `${positionLine(h, priceNow)} That's ${signed(p.pnl)} on the trade so far.`;
  return { kind: "move", headline, meaning, facts: { from, to: priceNow, move: Math.round(d * 100), pnl: Math.round(p.pnl) } };
}

/** The market closes within DEADLINE_MS. */
export function deadlineAlert(h: Held, endAt: number, now: number, priceNow: number | null): WatchAlert | null {
  if (!(endAt > now && endAt - now <= DEADLINE_MS)) return null;
  const headline = `"${h.title}" closes in ${shortSpan(endAt - now)}.`;
  const meaning = `If ${h.sideLabel} wins, your ${Math.floor(h.shares).toLocaleString("en-US")} shares pay ${dollars(h.shares)}; if not, $0.${priceNow !== null ? ` ${positionLine(h, priceNow)}` : ""}`;
  return { kind: "deadline", headline, meaning, facts: { endAt, shares: Math.floor(h.shares), pays: Math.round(h.shares), priceNow } };
}

/** The settled result of a watched side from the market's result. */
export function settledResult(side: "yes" | "no", marketResult: "yes" | "no" | "void" | null): "won" | "lost" | "void" | null {
  if (!marketResult) return null;
  if (marketResult === "void") return "void";
  return marketResult === side ? "won" : "lost";
}

/** The push message for an alert: the headline as the title, what it means as the body. */
export const alertPush = (a: WatchAlert, url: string): { title: string; body: string; url: string } => ({ title: a.headline.slice(0, 140), body: a.meaning.slice(0, 240), url });
