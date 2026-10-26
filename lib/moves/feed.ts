/* The feed as one viewer may receive it (docs/INSIDIR-V2.md §6, §8), built on the server:
 *   - Free: moves at least 30 minutes old; no records, so nobody is called a top trader and no record line is sent.
 *   - Members: live moves with records.
 *   - Links follow the location rules (lib/moves/links.ts): a US or unknown-region viewer never gets an
 *     international Polymarket link.
 * The status line reads the worker's move heartbeats: "Live · updated 8s ago", or "Catching up" when they're behind. */
import { like } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { workerHeartbeats } from "@/lib/db/schema";
import type { Plan, Region } from "@/lib/types";
import { agoText, moveSentence, payoutLine, recordLine, stockNote } from "./copy";
import { movePlan } from "./gate";
import { marketLink, type MarketLink } from "./links";
import { hasRecord, isTopTrader, walletLabel } from "./records";
import { kalshiMatches, listMoves, recordsFor, type MoveQuery } from "./store";
import type { League, Move, Tab } from "./types";

export interface FeedItem {
  id: string;
  source: Move["source"];
  tab: Tab;
  league: League | null;
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
}

export interface FeedStatus { state: "live" | "behind"; lastAt: number | null; text: string }

/** Behind when the newest successful poll of either source is older than this. */
export const BEHIND_AFTER_MS = 60_000;

export async function feedStatus(db: Db, now: number): Promise<FeedStatus> {
  const beats = await db.select().from(workerHeartbeats).where(like(workerHeartbeats.job, "moves:%"));
  const ok = beats.filter(b => (b.job === "moves:polymarket" || b.job === "moves:kalshi") && b.ok).map(b => b.lastRunAt.getTime());
  const lastAt = ok.length ? Math.max(...ok) : null;
  if (lastAt !== null && now - lastAt <= BEHIND_AFTER_MS) {
    return { state: "live", lastAt, text: `Live · updated ${Math.max(0, Math.round((now - lastAt) / 1000))}s ago` };
  }
  return { state: "behind", lastAt, text: "Catching up. Showing the latest moves we have." };
}

export async function feedItems(db: Db, moves: readonly Move[], plan: Plan, region: Region | null, now: number): Promise<FeedItem[]> {
  const p = movePlan(plan);
  const recs = p.records ? await recordsFor(db, moves.map(m => m.wallet ?? "")) : new Map();
  const matches = region === "non_us" ? new Map<string, string>() : await kalshiMatches(db, moves.filter(m => m.source === "polymarket").map(m => m.marketId));
  return moves.map(m => {
    const rec = m.wallet ? recs.get(m.wallet) ?? null : null;
    const shown = p.records && hasRecord(rec) ? rec : null;
    return {
      id: m.id, source: m.source, tab: m.tab, league: m.league,
      sentence: moveSentence(m, shown, now - m.at < 3_600_000), payout: payoutLine(m), record: recordLine(shown), topTrader: isTopTrader(shown),
      amount: m.amount, at: m.at, ago: agoText(m.at, now), eventTitle: m.eventTitle, marketTitle: m.marketTitle, outcome: m.outcome, marketId: m.marketId,
      wallet: m.wallet, walletLabel: m.wallet ? walletLabel(m.wallet, m.walletName) : null,
      link: marketLink(m, region, matches.get(m.marketId) ?? null), result: m.result,
      note: m.detail ? stockNote(m.detail) : null, ticker: m.detail?.kind === "insider" ? m.detail.ticker : null,
    };
  });
}

/** The feed query on the viewer's clock: a free viewer only gets moves older than the delay. */
export async function feedFor(db: Db, plan: Plan, region: Region | null, q: MoveQuery, now: number): Promise<FeedItem[]> {
  const delay = movePlan(plan).delayMs;
  const until = Math.min(q.until ?? now, now - delay);
  return feedItems(db, await listMoves(db, { ...q, until }), plan, region, now);
}
