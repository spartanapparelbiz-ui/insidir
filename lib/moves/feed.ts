/* The feed as one viewer may receive it (docs/INSIDIR-V2.md §6, §8), built on the server:
 *   - Free: moves at least 30 minutes old; no records, so nobody is called a top trader and no record line is sent.
 *   - Members: live moves with records.
 *   - Links follow the location rules (lib/moves/links.ts): a US or unknown-region viewer never gets an
 *     international Polymarket link.
 * The status line reads the worker's move heartbeats: "Live · updated 8s ago", or "Catching up" when they're behind. */
import { leagueLabel } from "./leagues";
import { inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { workerHeartbeats } from "@/lib/db/schema";
import type { Plan, Region } from "@/lib/types";
import { agoText, moveSentence, payoutLine, recordLine, stockNote } from "./copy";
import { movePlan } from "./gate";
import { marketLink, type MarketLink } from "./links";
import { moveSource, type SourceLink } from "./source";
import { hasRecord, isTopTrader, walletLabel } from "./records";
import { personName, profileHref } from "@/lib/profiles/name";
import { whyLines } from "@/lib/profiles/why-facts";
import { kalshiMatches, listMoves, recordsFor, type MoveQuery } from "./store";
import type { League, Move, Tab } from "./types";

export interface FeedItem {
  id: string;
  source: Move["source"];
  tab: Tab;
  league: League | null;
  /** What a sports card says after "Sports · " (lib/moves/leagues.ts): "Serie A", "NBA", "Dota 2". */
  leagueLabel?: string | null;
  sentence: string;
  payout: string | null;
  /** "Won 41 of 63 · +$1.2M all-time"; members only. */
  record: string | null;
  topTrader: boolean;
  amount: number;
  at: number;
  ago: string;
  eventTitle: string;
  marketTitle: string;
  outcome: string;
  marketId: string;
  /** Polymarket wallets: the trader page key and label. */
  wallet: string | null;
  walletLabel: string | null;
  link: MarketLink | null;
  result: Move["result"];
  /** Stocks: the line under the sentence (trade or filing date, 13F age) and the ticker for the tag. */
  note: string | null;
  ticker: string | null;
  /** Home page only (lib/home/curate.ts): one line of context under the short sentence (the trimmed market title,
   *  or a stock's trade and filing dates). */
  context?: string | null;
  /** Who moved, as the sentence names them, and their profile (/p/[id]); Kalshi traders are anonymous (no link). */
  who: { name: string; href: string | null; badge: "New wallet" | null };
  /** "Why this matters": at most one fact (lib/profiles/why.ts). */
  why: string | null;
  /** The public record behind the move: the Polygon transaction, Kalshi's trade record or the SEC filing (./source.ts). */
  sourceLink: SourceLink | null;
}

export interface FeedStatus { state: "live" | "behind"; lastAt: number | null; text: string }

/** A tab is "Catching up" when any of its sources hasn't had a successful update for this long. Data from then on
 *  is never presented as live. */
export const BEHIND_AFTER_MS = 5 * 60_000;
/** The worker jobs (heartbeats) that feed each tab. */
export const TAB_SOURCES: Record<Tab, string[]> = {
  sports: ["moves:polymarket", "moves:kalshi"],
  markets: ["moves:polymarket", "moves:kalshi"],
  stocks: ["stocks:form4"],
  crypto: ["moves:polymarket", "moves:kalshi"],
};

/** "Live · updated 8s ago", or "Catching up · last update 6m ago" when a source of this tab (all of Sports and
 *  Markets' sources without a tab) is 5+ minutes behind. "Last update" is the oldest of the tab's last good updates. */
export function statusOf(lastOk: ReadonlyArray<number | null>, now: number): FeedStatus {
  const known = lastOk.filter((t): t is number => t !== null);
  const oldest = known.length === lastOk.length && known.length ? Math.min(...known) : null;
  if (oldest !== null && now - oldest <= BEHIND_AFTER_MS) {
    const newest = Math.max(...known);
    return { state: "live", lastAt: newest, text: `Live · updated ${Math.max(0, Math.round((now - newest) / 1000))}s ago` };
  }
  const last = known.length ? Math.min(...known) : null;
  return { state: "behind", lastAt: last, text: last !== null ? `Catching up · last update ${agoText(last, now)}` : "Catching up · waiting for the first update" };
}

export async function feedStatus(db: Db, now: number, tab?: Tab): Promise<FeedStatus> {
  const jobs = tab ? TAB_SOURCES[tab] : TAB_SOURCES.sports;
  const beats = await db.select().from(workerHeartbeats).where(inArray(workerHeartbeats.job, jobs));
  const okAt = (job: string): number | null => {
    const b = beats.find(x => x.job === job);
    return b ? (b.lastOkAt?.getTime() ?? (b.ok ? b.lastRunAt.getTime() : null)) : null;
  };
  return statusOf(jobs.map(okAt), now);
}

/** Who moved, for the card: the name the sentence uses and where tapping it goes. */
export function whoOf(m: Move): FeedItem["who"] {
  const d = m.detail;
  if (d?.kind === "insider") return { name: personName(d.ownerName), href: d.ownerCik ? profileHref({ kind: "insider", cik: d.ownerCik }) : null, badge: null };
  if (d?.kind === "fund") return { name: d.fund, href: profileHref({ kind: "fund", cik: d.fundCik }), badge: null };
  if (m.source === "kalshi" || !m.wallet) return { name: "Someone", href: null, badge: null };
  return { name: walletLabel(m.wallet, m.walletName), href: profileHref({ kind: "trader", wallet: m.wallet }),
    badge: m.newWallet ? "New wallet" : null };
}

export async function feedItems(db: Db, moves: readonly Move[], plan: Plan, region: Region | null, now: number, until = now - movePlan(plan).delayMs): Promise<FeedItem[]> {
  const p = movePlan(plan);
  const recs = p.records ? await recordsFor(db, moves.map(m => m.wallet ?? "")) : new Map();
  const matches = region === "non_us" ? new Map<string, string>() : await kalshiMatches(db, moves.filter(m => m.source === "polymarket").map(m => m.marketId));
  const why = await whyLines(db, moves, { records: p.records, until, now }).catch(() => new Map<string, string | null>());
  return moves.map(m => {
    const rec = m.wallet ? recs.get(m.wallet) ?? null : null;
    const shown = p.records && hasRecord(rec) ? rec : null;
    return {
      id: m.id, source: m.source, tab: m.tab, league: m.league, leagueLabel: leagueLabel(m),
      sentence: moveSentence(m, shown, now - m.at < 3_600_000, now), payout: payoutLine(m), record: recordLine(shown), topTrader: isTopTrader(shown),
      amount: m.amount, at: m.at, ago: agoText(m.at, now), eventTitle: m.eventTitle, marketTitle: m.marketTitle, outcome: m.outcome, marketId: m.marketId,
      wallet: m.wallet, walletLabel: m.wallet ? walletLabel(m.wallet, m.walletName) : null,
      link: marketLink(m, region, matches.get(m.marketId) ?? null), result: m.result,
      note: m.detail ? stockNote(m.detail) : null, ticker: m.detail?.kind === "insider" ? m.detail.ticker : null,
      who: whoOf(m), why: why.get(m.id) ?? null, sourceLink: moveSource(m),
    };
  });
}

/** The feed query on the viewer's clock: a free viewer only gets moves older than the delay. */
export async function feedFor(db: Db, plan: Plan, region: Region | null, q: MoveQuery, now: number): Promise<FeedItem[]> {
  const delay = movePlan(plan).delayMs;
  const until = Math.min(q.until ?? now, now - delay);
  return feedItems(db, await listMoves(db, { ...q, until }), plan, region, now, until);
}
