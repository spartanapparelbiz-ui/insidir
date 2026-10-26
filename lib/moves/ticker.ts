/* One line per move for the home hero's ticker strip: "Someone · $48,000 on Lakers · 2 min ago". Built only from
 * what the feed already sent this viewer (lib/moves/feed.ts), so it follows the same plan and region rules. */
import { dollars } from "./copy";
import type { FeedItem } from "./feed";

const YES_NO = /^(yes|no)$/i;
const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

/** What the money went on, short: the side in sports ("Lakers"), "Yes" or "No" with the question, the company for stocks. */
export function tickerWhat(m: Pick<FeedItem, "source" | "tab" | "outcome" | "marketTitle" | "eventTitle">): string {
  if (m.source === "sec") return `of ${short(m.eventTitle, 28)}`;
  const o = m.outcome.trim();
  if (YES_NO.test(o)) return `on ${o[0]!.toUpperCase()}${o.slice(1).toLowerCase()} · ${short(m.marketTitle.trim(), 40)}`;
  return `on ${short(o, 32)}`;
}

export interface TickerItem { id: string; tab: FeedItem["tab"]; who: string; amount: string; what: string; ago: string; href: string }

export function tickerItem(m: FeedItem): TickerItem {
  return {
    id: m.id, tab: m.tab, who: short(m.who.name, 24), amount: dollars(m.amount), what: tickerWhat(m), ago: m.ago,
    href: m.source === "sec" ? `/feed?tab=stocks` : `/market/${encodeURIComponent(m.marketId)}`,
  };
}
