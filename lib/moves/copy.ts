/* One sentence per move that a 12-year-old gets (docs/INSIDIR-V2.md §4). We say what happened, never what to do.
 * Every sentence names who moved when the source says (lib/profiles/name.ts):
 *   "kch123, a top trader, just put $412,000 on Chiefs to win."   (public username; "a top trader" for members only)
 *   "0x12…ab just put $85,000 on "Yes" in "Fed rate cut in December?""   (no username: the short address)
 *   "A brand-new wallet just put $200,000 on Chiefs to win."      (no activity at all before this move)
 *   "Someone just put $48,000 on Lakers to win."                   (Kalshi: anonymous by design)
 *   "Filed today: Jen Hsun Huang, CEO of Nvidia, bought $1.4M of Nvidia stock on Oct 22."   (SEC Form 4, as filed:
 *   never "just bought", since the trade can be up to 2 business days older than the filing)
 *   "Pays $161 on every $100 if Chiefs win."      (payout = 100 ÷ price)
 *   "Won 41 of 63 · +$1.2M all-time"
 * Never: arb, arbitrage, orderbook, liquidity, spread, bid, ask, odds, implied probability, contracts, sharp, insider
 * info, lock, guaranteed, risk-free, free money, sure thing, "buy this", "copy this bet" (test/moves.test.ts). */
import { insiderWho } from "@/lib/profiles/name";
import { companyWithClass, niceName, shareClassOf } from "@/lib/stocks/names";
import { isTopTrader, walletLabel } from "./records";
import type { Move, TraderRecord } from "./types";

const YES_NO = /^(yes|no)$/i;

/** "$412,000", "$1.2M", "$98M", "$8.77B". */
export function dollars(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
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

/** Who moved: the wallet's public username or short address ("…, a top trader" when the viewer may see records and
 *  it is one), "A brand-new wallet", or "Someone" (Kalshi). Never anything about who is behind a wallet. */
export function who(m: Pick<Move, "source" | "wallet" | "walletName"> & { newWallet?: boolean | null }, record: TraderRecord | null): string {
  if (m.source === "kalshi" || !m.wallet) return "Someone";
  if (m.newWallet) return "A brand-new wallet";
  const label = walletLabel(m.wallet, m.walletName);
  return isTopTrader(record) ? `${label}, a top trader,` : label;
}

export function moveSentence(m: Move, record: TraderRecord | null, live = true, now = Date.now()): string {
  if (m.source === "sec" && m.detail) return stockSentence(m.detail, m.amount, now);
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
export const calDay = (d: string) => DAY_UTC.format(new Date(`${d}T12:00:00Z`));
const perShare = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const YMD_ET = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" });
/** "Filed today" / "Filed Oct 24": the filing day, Eastern. */
const filedWhen = (filedAt: number, now: number) => (YMD_ET.format(new Date(filedAt)) === YMD_ET.format(new Date(now)) ? "today" : DAY.format(new Date(filedAt)));
/** "2026-09-30" → "Q3 2026": the calendar quarter a 13F's period ends. */
export function quarterOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `Q${Math.ceil(m! / 3)} ${y}`;
}

/** "Filed today: Tim Cook, CEO of Apple, bought $1.4M of Apple stock on Oct 22." /
 *  "Berkshire Hathaway added $250M of Chevron in Q3 2026." Never "just bought": a Form 4 reports a trade up to 2
 *  business days old, and a 13F holdings up to 45 days after the quarter. */
export function stockSentence(d: NonNullable<Move["detail"]>, amount: number, now = Date.now()): string {
  if (d.kind === "insider") return `Filed ${filedWhen(d.filedAt, now)}: ${insiderWho(d.ownerName, d.role, niceName(d.company))}, bought ${dollars(amount)} of ${niceName(d.company)} stock${d.tradeDate ? ` on ${calDay(d.tradeDate)}` : ""}.`;
  return `${niceName(d.fund)} added ${dollars(amount)} of ${companyWithClass(d.company, shareClassOf(d.shareClass ? `class ${d.shareClass}` : null, d.cusip))} ${d.period ? `in ${quarterOf(d.period)}` : "last quarter"}${d.newPosition ? ", a new position" : ""}.`;
}

/** The line under a stock card. Form 4: both the trade date and the filing date. 13F: "Q3 2026 holdings · filed Nov 14." */
export function stockNote(d: NonNullable<Move["detail"]>): string {
  if (d.kind === "insider") {
    return `${d.tradeDate ? `Traded ${calDay(d.tradeDate)} at ${perShare(d.pricePerShare)} a share.` : "Trade date not given in the filing."} Filed with the SEC ${DAY.format(new Date(d.filedAt))}.`;
  }
  return `${d.period ? `${quarterOf(d.period)} holdings` : "Holdings"} · filed ${calDay(d.filedOn)}. 13F data can be up to 45 days old.`;
}

/** "Won 41 of 63 · +$1.2M all-time", only when the wallet has a record. */
export function recordLine(r: TraderRecord | null): string | null {
  if (!r || r.resolved < 20) return null;
  return `Won ${r.won} of ${r.resolved} · ${signedShort(r.profit)} all-time`;
}

const CLOCK_ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const DATE_ET = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
/** "3:14 PM ET": every clock time on the site is Eastern. */
export const clockET = (ms: number): string => `${CLOCK_ET.format(new Date(ms))} ET`;
/** "Oct 26, 2026, 3:14 PM ET" (titles and tooltips on times). */
export const dateTimeET = (ms: number): string => `${DATE_ET.format(new Date(ms))} ET`;

/** "just now", "2m ago", "3h ago", "2d ago" (components/TimeAgo keeps it ticking in the browser). */
export function agoText(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Words never shown in the UI (checked over every page's copy by the tests). */
export const BANNED_WORDS = [
  /\barb(itrage)?\b/i, /\border ?book\b/i, /\bliquidity\b/i, /\bspread\b/i, /\bbids?\b/i, /\basks?\b/i, /\bodds\b/i,
  /\bimplied probability\b/i, /\bcontracts?\b/i, /\bsharps?\b/i, /\binsider info\b/i, /\block(s|ed)? in\b/i, /\bguaranteed\b/i,
  /\brisk[- ]free\b/i, /\bfree money\b/i, /\bsure thing\b/i, /\bbuy this\b/i, /\bcopy this bet\b/i,
];
