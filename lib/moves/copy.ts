/* One line per position, in the house style (docs/INSIDIR-V2.md §4): the tone of a financial terminal written in plain
 * English. Short and factual; no slang, no exclamation marks, no "just". Say what happened, never what to do.
 * Every line names who opened the position when the source says (lib/profiles/name.ts):
 *   "kch123 · Top-ranked trader: $412,000 position on Chiefs to win."   (public username; the rank for members only)
 *   "0x12…ab: $85,000 position on "Yes" in "Fed rate cut in December?""   (no username: the short address)
 *   "New account: $200,000 position on Chiefs to win."                (no activity at all before this position)
 *   "Anonymous · Kalshi: $48,000 position on Lakers to win."          (Kalshi: anonymous by design)
 *   "Form 4 · Filed Oct 24 · CEO Jen-Hsun Huang purchased $1.4M of NVDA on Oct 22."   (SEC Form 4, as filed: the
 *   trade can be up to 2 business days older than the filing)
 *   "Payout 1.61× if Chiefs win."      (payout = 1 ÷ entry)
 *   "Won 41 of 63 · Net P&L +$1.2M"
 * Never: guaranteed, risk-free, free money, sure thing, lock, insider info, "buy this", "copy this bet", sharp, and
 * the old wording (big move, "just put", Someone, chance): test/moves.test.ts BANNED_WORDS. */
import { personName, roleOf as insiderRole } from "@/lib/profiles/name";
import { companyWithClass, niceName, shareClassOf } from "@/lib/stocks/names";
import { isTopTrader, walletLabel } from "./records";
import type { Move, TraderRecord } from "./types";

const YES_NO = /^(yes|no)$/i;

export { dollars } from "@/lib/money";
import { dollars } from "@/lib/money";
/** "+$1.2M", "−$40K" for record lines. */
export function signedShort(v: number): string {
  return `${v < 0 ? "−" : "+"}${dollars(Math.abs(v))}`;
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

/** Anonymous by design: Kalshi never says who. */
export const ANONYMOUS = "Anonymous · Kalshi";

/** Who opened the position: the wallet's public username or short address ("· Top-ranked trader" when the viewer may
 *  see records and it is one), "New account", or "Anonymous · Kalshi". Never anything about who is behind a wallet. */
export function who(m: Pick<Move, "source" | "wallet" | "walletName"> & { newWallet?: boolean | null }, record: TraderRecord | null): string {
  if (m.source === "kalshi" || !m.wallet) return ANONYMOUS;
  if (m.newWallet) return "New account";
  const label = walletLabel(m.wallet, m.walletName);
  return isTopTrader(record) ? `${label} · Top-ranked trader` : label;
}

/** "kch123: $412,000 position on Chiefs to win." (`live` is kept for callers; the line reads the same either way.) */
export function moveSentence(m: Move, record: TraderRecord | null, _live = true, now = Date.now()): string {
  if (m.source === "sec" && m.detail) return stockSentence(m.detail, m.amount, now);
  return `${who(m, record)}: ${dollars(m.amount)} position on ${onWhat(m)}.`;
}

/** "Payout 1.61× if Chiefs win." The multiple of the stake returned if the outcome settles their way (1 ÷ entry). */
export function payoutLine(m: Pick<Move, "outcome" | "avgPrice" | "tab">): string | null {
  if (m.tab === "stocks" || !(m.avgPrice > 0 && m.avgPrice < 1)) return null;
  const x = 1 / m.avgPrice;
  const o = clean(m.outcome);
  const cond = YES_NO.test(o) ? `if it settles ${o[0]!.toUpperCase()}${o.slice(1).toLowerCase()}` : m.tab === "sports" ? `if ${o} win` : `if it settles "${o}"`;
  return `Payout ${x >= 10 ? x.toFixed(1) : x.toFixed(2)}× ${cond}.`;
}

/* ---------- Stocks (SEC filings) ---------- */

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const DAY_UTC = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "2026-09-30" → "Sep 30" (a calendar date, no time zone shift). */
export const calDay = (d: string) => DAY_UTC.format(new Date(`${d}T12:00:00Z`));
const perShare = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const YMD_ET = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" });
/** "Filed Oct 24": the filing day, Eastern (today too: a date, never "today"). */
const filedWhen = (filedAt: number, _now: number) => DAY.format(new Date(filedAt));
/** "2026-09-30" → "Q3 2026": the calendar quarter a 13F's period ends. */
export function quarterOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `Q${Math.ceil(m! / 3)} ${y}`;
}

/** "Form 4 · Filed Oct 24 · CEO Tim Cook purchased $1.4M of AAPL on Oct 22." /
 *  "13F · Q3 2026 · Berkshire Hathaway added $250M of Chevron, a new position." A Form 4 reports a trade up to 2
 *  business days old, and a 13F holdings up to 45 days after the quarter. */
export function stockSentence(d: NonNullable<Move["detail"]>, amount: number, now = Date.now()): string {
  if (d.kind === "insider") {
    const role = insiderRole(d.role).replace(/^(a|an|the)\s+/i, "");
    const title = /^(ceo|cfo|coo|cto)$/i.test(role) ? role.toUpperCase() : role[0]!.toUpperCase() + role.slice(1);
    const what = d.ticker ? d.ticker.toUpperCase() : `${niceName(d.company)} stock`;
    return `Form 4 · Filed ${filedWhen(d.filedAt, now)} · ${title} ${personName(d.ownerName)} purchased ${dollars(amount)} of ${what}${d.tradeDate ? ` on ${calDay(d.tradeDate)}` : ""}.`;
  }
  return `13F · ${d.period ? quarterOf(d.period) : "Last quarter"} · ${niceName(d.fund)} added ${dollars(amount)} of ${companyWithClass(d.company, shareClassOf(d.shareClass ? `class ${d.shareClass}` : null, d.cusip))}${d.newPosition ? ", a new position" : ""}.`;
}

/** The line under a stock card. Form 4: both the trade date and the filing date. 13F: "Q3 2026 holdings · filed Nov 14." */
export function stockNote(d: NonNullable<Move["detail"]>): string {
  if (d.kind === "insider") {
    return `${d.tradeDate ? `Traded ${calDay(d.tradeDate)} at ${perShare(d.pricePerShare)} a share.` : "Trade date not given in the filing."} Filed with the SEC ${DAY.format(new Date(d.filedAt))}.`;
  }
  return `${d.period ? `${quarterOf(d.period)} holdings` : "Holdings"} · filed ${calDay(d.filedOn)}. 13F data can be up to 45 days old.`;
}

/** "Won 41 of 63 · Net P&L +$1.2M", only when the wallet has a record. */
export function recordLine(r: TraderRecord | null): string | null {
  if (!r || r.resolved < 20) return null;
  return `Won ${r.won} of ${r.resolved} · Net P&L ${signedShort(r.profit)}`;
}

const CLOCK_ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const DATE_ET = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
/** "3:14 PM ET": every clock time on the site is Eastern. */
export const clockET = (ms: number): string => `${CLOCK_ET.format(new Date(ms))} ET`;
/** "Oct 26, 2026, 3:14 PM ET" (titles and tooltips on times). */
export const dateTimeET = (ms: number): string => `${DATE_ET.format(new Date(ms))} ET`;

/** "now", "2m ago", "3h ago", "2d ago" (components/TimeAgo keeps it ticking in the browser). */
export function agoText(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Words never shown in the UI (checked over every page's copy by the tests). */
export const BANNED_WORDS = [
  // compliance
  /\bguaranteed\b/i, /\brisk[- ]free\b/i, /\bfree money\b/i, /\bsure thing\b/i, /\block(s|ed)? in\b/i, /\binsider info\b/i,
  /\bbuy this\b/i, /\bcopy this bet\b/i, /\bsharps?\b/i,
  // jargon we still don't use
  /\barb(itrage)?\b/i, /\border ?book\b/i, /\bliquidity\b/i, /\bspread\b/i, /\bbids?\b/i, /\basks?\b/i, /\bodds\b/i, /\bcontracts?\b/i,
  // the old wording, so it can't come back
  /\bjust put\b/i, /\bbig moves?\b/i, /\bsomeone\b/i, /\bchance\b/i,
];
