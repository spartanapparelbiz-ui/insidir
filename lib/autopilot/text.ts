/* What /autopilot says about a rule's backtest and paper portfolio. Pure. Real numbers only; losses always shown. */
import type { Backtest } from "./backtest";
import type { Paper } from "./queries";

const usd = (n: number) => { const a = Math.abs(n); return a < 100 && Math.round(a * 100) % 100 !== 0 ? `$${a.toFixed(2)}` : `$${Math.round(a).toLocaleString("en-US")}`; };
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usd(n)}`;
const DAYF = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

export function backtestLine(b: Backtest | null): string {
  if (!b) return "Backtest running: it shows here within the hour.";
  const settled = b.won + b.lost;
  if (!b.bets) return `No trades in the last ${b.days} days would have matched this rule.`;
  const since = b.from !== null && b.to - b.from < (b.days - 7) * 86_400_000 ? ` (records start ${DAYF.format(new Date(b.from))})` : "";
  const head = `Last ${b.days} days${since}: ${b.bets} ${b.bets === 1 ? "trade" : "trades"}`;
  if (!settled) return `${head}, none settled yet.`;
  const roi = b.roi !== null ? ` (${b.roi >= 0 ? "+" : "−"}${Math.abs(Math.round(b.roi * 100))}%)` : "";
  return `${head}: ${b.won} won, ${b.lost} lost${b.open ? `, ${b.open} open` : ""}. Net ${signed(b.net)} on ${usd(b.staked)} staked${roi}. Worst drop ${b.maxDrawdown ? `−${usd(b.maxDrawdown)}` : "$0"}.`;
}

export function paperLine(p: Paper): string {
  if (!p.matches) return "No matches yet. Its paper portfolio starts with the first one.";
  const closed = p.won + p.lost + p.exited;
  const parts = [`${p.matches} ${p.matches === 1 ? "match" : "matches"}`];
  if (closed) parts.push(`${p.won} won, ${p.lost} lost${p.exited ? `, ${p.exited} sold when the wallet exited` : ""}`);
  if (p.open) parts.push(`${p.open} open`);
  return `Paper portfolio: ${parts.join(" · ")}${closed ? `. Net ${signed(p.net)} on ${usd(p.staked)}.` : "."}`;
}
