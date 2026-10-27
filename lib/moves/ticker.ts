/* One short line per move for the home hero's ticker strip: "$48K on Lakers · 2m". Built only from what the feed
 * already sent this viewer (lib/moves/feed.ts), so it follows the same plan and region rules; the home page passes
 * only mainstream moves (lib/home/curate.ts). */
import { compactDollars, trimTitle } from "@/lib/home/curate";
import type { FeedItem } from "./feed";

const YES_NO = /^(yes|no)$/i;
const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

/** What the money went on, short: the side in sports ("Lakers"), "Yes" or "No" with the question, the company for stocks. */
export function tickerWhat(m: Pick<FeedItem, "source" | "tab" | "outcome" | "marketTitle" | "eventTitle"> & { company?: string | null }): string {
  if (m.source === "sec") return `of ${short(m.company ?? m.eventTitle, 28)}`;
  const o = m.outcome.trim();
  if (YES_NO.test(o)) return `on ${o[0]!.toUpperCase()}${o.slice(1).toLowerCase()} · ${trimTitle(m.marketTitle, 30)}`;
  return `on ${short(o, 28)}`;
}

/** "2m ago" → "2m"; "just now" stays. */
const agoShort = (a: string) => a.replace(/ ago$/, "");

export interface TickerItem { id: string; tab: FeedItem["tab"]; amount: string; what: string; ago: string; href: string }

export function tickerItem(m: FeedItem & { company?: string | null }): TickerItem {
  return {
    id: m.id, tab: m.tab, amount: compactDollars(m.amount), what: tickerWhat(m), ago: agoShort(m.ago),
    href: m.source === "sec" ? `/feed?tab=stocks` : `/market/${encodeURIComponent(m.marketId)}`,
  };
}
