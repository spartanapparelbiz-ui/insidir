/* The member's calculators (docs/RESEARCH-DESK.md §2.4, §8.4). Pure arithmetic on numbers the member typed; runs in
 * the browser. Nothing here estimates, defaults or suggests a value: a missing input returns null, never a guess. */
import type { Position } from "./types";

/** A typed field: "" stays missing; anything else must be a finite number. */
export function parseInput(raw: string): number | null {
  const s = raw.trim().replace(/[$,%¢\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface EvInputs {
  /** Price paid per contract, in cents (1–99). */
  priceCents: number | null;
  /** The member's own probability for their side, in percent (0–100). */
  probabilityPct: number | null;
  contracts: number | null;
  /** Fee per contract, in dollars (0 allowed, but must be typed). */
  feePerContract: number | null;
}
export interface EvResult { perContract: number; total: number; breakevenPct: number; formula: string }

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Expected value of a $1-payout contract at the member's price, probability and fee. Null until every input is
 *  typed and in range. */
export function expectedValue(i: EvInputs): EvResult | null {
  const { priceCents: c, probabilityPct: q, contracts: n, feePerContract: fee } = i;
  if (c === null || q === null || n === null || fee === null) return null;
  if (c <= 0 || c >= 100 || q < 0 || q > 100 || n <= 0 || !Number.isInteger(n) || fee < 0) return null;
  const price = c / 100, p = q / 100;
  const perContract = r4(p * (1 - price) - (1 - p) * price - fee);
  return {
    perContract, total: Math.round(perContract * n * 100) / 100, breakevenPct: Math.round((price + fee) * 10_000) / 100,
    formula: `${p} × (1 − ${price}) − ${r4(1 - p)} × ${price} − ${fee} = ${perContract}`,
  };
}

/** A logged position's P&L at a mark the member supplies (a delayed quote they chose to use, or their own number).
 *  Equity: (mark − entry) × qty, sign by side, minus fees. Event: resolved → payout − cost − fees; open → at the mark.
 *  Null when there is nothing to price it at. */
export function positionPnl(p: Position, mark: number | null): number | null {
  const sign = p.side === "short" ? -1 : 1;
  if (p.kind === "equity") {
    const at = p.exitPrice ?? mark;
    if (at === null) return null;
    return Math.round(((at - p.entryPrice) * p.quantity * sign - p.fees) * 100) / 100;
  }
  if (p.resolution) {
    const payout = p.resolution === "void" ? p.entryPrice : p.resolution === p.side ? 1 : 0;
    return Math.round(((payout - p.entryPrice) * p.quantity - p.fees) * 100) / 100;
  }
  if (mark === null) return null;
  return Math.round(((mark - p.entryPrice) * p.quantity - p.fees) * 100) / 100;
}

/** The validation for a position before it is saved: the member's own inputs, checked for shape only. */
export function positionProblem(p: Position): string | null {
  if (!Number.isFinite(p.quantity) || p.quantity <= 0) return "Quantity must be more than 0.";
  if (!Number.isFinite(p.entryPrice) || p.entryPrice <= 0) return "Entry price must be more than 0.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.entryDate)) return "Pick an entry date.";
  if (!Number.isFinite(p.fees) || p.fees < 0) return "Fees can't be negative.";
  if (p.kind === "equity") {
    if (p.tickers.length !== 1) return "Pick one ticker.";
    if (p.side !== "long" && p.side !== "short") return "Pick long or short.";
  } else {
    if (!p.label?.trim()) return "Name the contract.";
    if (p.side !== "yes" && p.side !== "no") return "Pick Yes or No.";
    if (p.entryPrice >= 1) return "Contract prices are under $1.";
  }
  return null;
}
