/* The words on an X-ray, written from the numbers. Data only: nothing here tells anyone what to bet. */
import { money, pct, shares } from "./format";
import type { Flow, SharpMoney } from "./score";

/** On every page. */
export const FOOTER =
  "Information only. Not financial advice. Insidir is not affiliated with Polymarket. An insider pattern is not proof of insider trading.";

const label = (outcomes: readonly string[], i: number | null): string => (i === null ? "" : (outcomes[i] ?? `Outcome ${i + 1}`).toUpperCase());

export function sharpHeadline(s: SharpMoney, outcomes: readonly string[]): string {
  if (!s.call || s.leaderShare === null) return "Not enough proven wallets here yet";
  return `Sharp money: ${pct(s.leaderShare)} ${label(outcomes, s.leaderIndex)}`;
}

export function sharpDetail(s: SharpMoney, resolved: boolean): string {
  const n = s.walletCount;
  const who = `${n} wallet${n === 1 ? "" : "s"} with proven records`;
  if (n === 0) return "None of the top holders has a proven record yet";
  if (s.byShares) return `${who} held ${shares(s.total)} shares`;
  return `${who} ${resolved ? "held" : "hold"} ${money(s.total)}`;
}

/** `beforeClose`: the window is the 24 hours before a closed market ended. */
export function flowHeadline(f: Flow, outcomes: readonly string[], beforeClose = false): string {
  const when = beforeClose ? "in its last 24h" : "in the last 24h";
  if (f.quiet || f.leaderIndex === null) return `Quiet ${when}`;
  return `${money(f.net[f.leaderIndex] ?? 0)} net into ${label(outcomes, f.leaderIndex)} ${when}`;
}

export function insiderHeadline(count: number, strong: number, beforeClose = false): string {
  const when = beforeClose ? "in its last 7 days" : "in the last 7 days";
  if (count === 0) return `No insider patterns ${when}`;
  const base = `${count} insider pattern${count === 1 ? "" : "s"} ${when}`;
  return strong ? `${base}, ${strong} on a long shot` : base;
}
