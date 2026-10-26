/* One sentence per move that a 12-year-old gets (docs/INSIDIR-V2.md §4). We say what happened, never what to do.
 *   "A top trader just put $412,000 on Chiefs to win."
 *   "A wallet just put $85,000 on "Yes" in "Fed rate cut in December?""
 *   "Someone just put $48,000 on Lakers to win."
 *   "Pays $161 on every $100 if Chiefs win."      (payout = 100 ÷ price)
 *   "Won 41 of 63 · +$1.2M all-time"
 * Never: arb, arbitrage, orderbook, liquidity, spread, bid, ask, odds, implied probability, contracts, sharp, insider
 * info, lock, guaranteed, risk-free, free money, sure thing, "buy this", "copy this bet" (test/moves.test.ts). */
import { isTopTrader } from "./records";
import type { Move, TraderRecord } from "./types";

const YES_NO = /^(yes|no)$/i;

/** "$412,000", "$1.2M", "$48,000". */
export function dollars(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `${s}$${Math.round(a).toLocaleString("en-US")}`;
  return `${s}$${a.toFixed(0)}`;
}
/** "+$1.2M", "−$40K" for record lines. */
export function signedShort(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "−" : "+";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}K`;
  return `${s}$${Math.round(a)}`;
}

const clean = (t: string) => t.trim().replace(/\s+/g, " ");

/** What the money is on, in words: a named side ("Chiefs to win" in sports) or "Yes"/"No" in a quoted question;
 *  for SEC filings, the company's stock. */
export function onWhat(m: Pick<Move, "outcome" | "marketTitle" | "tab"> & { detail?: Move["detail"] }): string {
  if (m.detail) return `${m.detail.company} stock`;
  const o = clean(m.outcome);
  if (YES_NO.test(o)) return `"${o[0]!.toUpperCase()}${o.slice(1).toLowerCase()}" in "${clean(m.marketTitle)}"`;
  return m.tab === "sports" ? `${o} to win` : `"${o}" in "${clean(m.marketTitle)}"`;
}

/** Who moved: a top trader (20+ resolved markets, positive all-time profit), a wallet, or someone (Kalshi). */
export function who(m: Pick<Move, "source">, record: TraderRecord | null): string {
  if (m.source === "kalshi") return "Someone";
  return isTopTrader(record) ? "A top trader" : "A wallet";
}

export function moveSentence(m: Move, record: TraderRecord | null, live = true): string {
  if (m.source === "sec" && m.detail) return stockSentence(m.detail, m.amount, live);
  return `${who(m, record)} ${live ? "just put" : "put"} ${dollars(m.amount)} on ${onWhat(m)}.`;
}

/** "Pays $161 on every $100 if Chiefs win." Dollars only, never cents or odds. */
export function payoutLine(m: Pick<Move, "outcome" | "avgPrice" | "tab">): string | null {
  if (m.tab === "stocks" || !(m.avgPrice > 0 && m.avgPrice < 1)) return null;
  const pays = Math.round(100 / m.avgPrice);
  const o = clean(m.outcome);
  const cond = YES_NO.test(o) ? `if the answer is ${o[0]!.toUpperCase()}${o.slice(1).toLowerCase()}` : m.tab === "sports" ? `if ${o} win` : `if it's "${o}"`;
  return `Pays $${pays.toLocaleString("en-US")} on every $100 ${cond}.`;
}

/* ---------- Stocks (SEC filings) ---------- */

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const DAY_UTC = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "2026-09-30" → "Sep 30" (a calendar date, no time zone shift). */
const calDay = (d: string) => DAY_UTC.format(new Date(`${d}T12:00:00Z`));
const perShare = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "The CEO of Apple just bought $1.4M of Apple stock." / "Berkshire Hathaway added $250M of Chevron last quarter." */
export function stockSentence(d: NonNullable<Move["detail"]>, amount: number, live = true): string {
  if (d.kind === "insider") return `${d.role} of ${d.company} ${live ? "just bought" : "bought"} ${dollars(amount)} of ${d.company} stock.`;
  return `${d.fund} added ${dollars(amount)} of ${d.company} last quarter${d.newPosition ? ", a new position" : ""}.`;
}

/** The line under a stock card: when it was traded or filed, and how old 13F data can be. */
export function stockNote(d: NonNullable<Move["detail"]>): string {
  if (d.kind === "insider") {
    return `${d.tradeDate ? `Bought ${calDay(d.tradeDate)} at ${perShare(d.pricePerShare)} a share. ` : ""}Filed with the SEC ${DAY.format(new Date(d.filedAt))}.`;
  }
  return `Filed ${calDay(d.filedOn)}${d.period ? ` for the quarter ending ${calDay(d.period)}` : ""}. 13F data can be up to 45 days old.`;
}

/** "Won 41 of 63 · +$1.2M all-time", only when the wallet has a record. */
export function recordLine(r: TraderRecord | null): string | null {
  if (!r || r.resolved < 20) return null;
  return `Won ${r.won} of ${r.resolved} · ${signedShort(r.profit)} all-time`;
}

/** "just now", "2 min ago", "3 h ago", "2 days ago". */
export function agoText(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Words never shown in the UI (checked over every page's copy by the tests). */
export const BANNED_WORDS = [
  /\barb(itrage)?\b/i, /\border ?book\b/i, /\bliquidity\b/i, /\bspread\b/i, /\bbids?\b/i, /\basks?\b/i, /\bodds\b/i,
  /\bimplied probability\b/i, /\bcontracts?\b/i, /\bsharps?\b/i, /\binsider info\b/i, /\block(s|ed)? in\b/i, /\bguaranteed\b/i,
  /\brisk[- ]free\b/i, /\bfree money\b/i, /\bsure thing\b/i, /\bbuy this\b/i, /\bcopy this bet\b/i,
];
