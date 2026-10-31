/* The feed as one viewer may receive it (docs/INSIDIR-V2.md §6, §8), built on the server:
 *   - Free: moves at least 30 minutes old; no records, so nobody is called a top trader and no record line is sent.
 *   - Members: live moves with records.
 *   - Links follow the location rules (lib/moves/links.ts): a US or unknown-region viewer never gets an
 *     international Polymarket link.
 * The status line reads the worker's move heartbeats: "Live · updated 8s ago", or "Catching up" when they're behind. */
import { splitsFor } from "@/lib/smart/store";
import { splitLine } from "@/lib/smart/text";
import { leagueLabel } from "./leagues";
import { chance, claimOf, headlineOf, short, sublineOf } from "./headline";
import { lowInterest, type LowReason } from "./interest";
import { groupBets, groupTitle } from "./group";
import { infoFor } from "@/lib/markets/info";
import { trackerBySlug, trackerWhere } from "@/lib/trackers";
import { inArray } from "drizzle-orm";
import { notesFor, type StoredNote } from "@/lib/analyst/store";
import type { Fact } from "@/lib/analyst/types";
import type { Db } from "@/lib/db";
import { workerHeartbeats } from "@/lib/db/schema";
import type { Plan, Region } from "@/lib/types";
import { agoText, ANONYMOUS, moveSentence, payoutLine, recordLine, stockNote } from "./copy";
import { movePlan } from "./gate";
import { marketLink, type MarketLink } from "./links";
import { moveSource, type SourceLink } from "./source";
import { hasRecord, isTopTrader, walletLabel } from "./records";
import { companyHref, personName, profileHref } from "@/lib/profiles/name";
import type { FollowKind } from "@/lib/db/schema";
import { whyLines } from "@/lib/profiles/why-facts";
import { kalshiMatches, listMoves, recordsFor, type MoveQuery } from "./store";
import { artOfMove, type MoveArt } from "@/lib/logos";
import { moveFace, type Face } from "./avatar";
import { avatarsOrNone } from "./avatar-store";
import type { League, Move, Tab } from "./types";

export interface FeedItem {
  id: string;
  /** Its analyst note (lib/analyst), with every fact it used and that fact's link; null until the worker writes one. */
  analyst?: { text: string; facts: Fact[]; at: number } | null;
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
  /** Its artwork (lib/logos.ts moveArt): the game's two teams, the filing's company and insider, the one logo it's
   *  about, or its subject's photo. */
  art?: MoveArt;
  /** Home page only (lib/home/curate.ts): one line of context under the short sentence (the trimmed market title,
   *  or a stock's trade and filing dates). */
  context?: string | null;
  /** Who moved, as the sentence names them, and their profile (/p/[id]); Kalshi traders are anonymous (no link). */
  who: { name: string; href: string | null; badge: "New account" | null };
  /** Their Polymarket picture, or the monogram (lib/moves/avatar.ts). */
  face: Face;
  /** "Why this matters": at most one fact (lib/profiles/why.ts). */
  why: string | null;
  /** The public record behind the move: the Polygon transaction, Kalshi's trade record or the SEC filing (./source.ts). */
  sourceLink: SourceLink | null;
  /** SEC cards: who can be followed from it (the insider and their company, or the fund; lib/follows.ts). */
  secFollows?: Array<{ kind: FollowKind; target: string; label: string }>;
  /** Insider cards: every insider trade at the company (/insider-trading/<ticker>). */
  companyHref?: string | null;
  /** The market's live split (lib/smart): "Crowd 62% · Smart money 81%", when there is one. */
  split?: string | null;
  /** "No runs in the 1st inning" (lib/moves/headline.ts outcomeOf), and the grey line under it. */
  headline: string;
  subline: string;
  /** The price paid, as a chance ("45%"); the price of their side now, 0..1, when known (refreshed every minute). */
  inAt: string | null;
  avgPrice: number;
  outcomeSide: "yes" | "no";
  nowPrice: number | null;
  /** Settled: what the bet made or lost, dollars. Polymarket from the wallet's own trades (sales and payout); Kalshi
   *  the settled contracts' payout less what they cost. Null until known. */
  pnl: number | null;
  /** Why the default feed leaves it out (lib/moves/interest.ts); null when it shows. */
  low: LowReason | null;
  /** A group card (lib/moves/group.ts): every bet in it, newest first, and its title. */
  bets?: FeedItem[];
  groupTitle?: string;
}

/** What a settled bet made: Polymarket's realized P&L from the wallet's trades; Kalshi's settled payout. */
export function settledPnl(m: Pick<Move, "source" | "result" | "pnl" | "amount" | "avgPrice">): number | null {
  if (!m.result || m.result === "void") return m.result === "void" ? 0 : null;
  if (m.source === "polymarket") return m.pnl ?? null;
  if (m.source === "kalshi" && m.avgPrice > 0 && m.avgPrice < 1) return m.result === "won" ? m.amount * (1 / m.avgPrice - 1) : -m.amount;
  return null;
}

/** One card per group of bets on the same outcome within the hour; a group's numbers add up its bets. */
export function groupFeed(items: readonly FeedItem[]): FeedItem[] {
  return groupBets(items).map(g => {
    if (g.length === 1) return g[0]!;
    const total = g.reduce((a, b) => a + b.amount, 0);
    const lead = g[0]!;
    const side = /^(yes|no)$/i.test(lead.outcome) ? lead.outcome[0]!.toUpperCase() + lead.outcome.slice(1).toLowerCase() : lead.outcome;
    const settled = g.every(b => b.result), pnls = g.map(b => b.pnl);
    const cost = g.reduce((a, b) => a + b.amount * b.avgPrice, 0) / total;
    return { ...lead, id: `g:${g[g.length - 1]!.id}`, amount: total, bets: [...g], groupTitle: groupTitle(g.length, side, total),
      headline: groupTitle(g.length, side, total), avgPrice: cost, inAt: chance(cost),
      pnl: settled && pnls.every(p => p !== null) ? pnls.reduce((a, b) => a! + b!, 0) : null, result: settled ? lead.result : null, at: lead.at };
  });
}

export type { Move };

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

/** What an SEC card lets a member follow: the insider and their company, or the fund. */
export function secFollowsOf(m: Move): NonNullable<FeedItem["secFollows"]> {
  const d = m.detail;
  if (d?.kind === "insider") return [
    ...(d.ownerCik ? [{ kind: "insider" as const, target: String(Number(d.ownerCik)), label: "Follow insider" }] : []),
    { kind: "company" as const, target: String(Number(d.issuerCik)), label: "Follow company" },
  ];
  if (d?.kind === "fund") return [{ kind: "fund", target: String(Number(d.fundCik)), label: "Follow fund" }];
  return [];
}

/** Who moved, for the card: the name the sentence uses and where tapping it goes. */
export function whoOf(m: Move): FeedItem["who"] {
  const d = m.detail;
  if (d?.kind === "insider") return { name: personName(d.ownerName), href: d.ownerCik ? profileHref({ kind: "insider", cik: d.ownerCik, name: d.ownerName }) : null, badge: null };
  if (d?.kind === "fund") return { name: d.fund, href: profileHref({ kind: "fund", cik: d.fundCik, name: d.fund }), badge: null };
  if (m.source === "kalshi" || !m.wallet) return { name: ANONYMOUS, href: null, badge: null };
  return { name: walletLabel(m.wallet, m.walletName), href: profileHref({ kind: "trader", wallet: m.wallet }),
    badge: m.newWallet ? "New account" : null };
}

export async function feedItems(db: Db, moves: readonly Move[], plan: Plan, region: Region | null, now: number, until = now - movePlan(plan).delayMs): Promise<FeedItem[]> {
  const p = movePlan(plan);
  const recs = p.records ? await recordsFor(db, moves.map(m => m.wallet ?? "")) : new Map();
  const matches = region === "non_us" ? new Map<string, string>() : await kalshiMatches(db, moves.filter(m => m.source === "polymarket").map(m => m.marketId));
  const why = await whyLines(db, moves, { records: p.records, until, now }).catch(() => new Map<string, string | null>());
  const avatars = await avatarsOrNone(db, moves.map(m => m.wallet ?? ""));
  const prices = new Map<string, number | null>();
  for (const source of ["polymarket", "kalshi"] as const) {
    const open = moves.filter(m => m.source === source && !m.result).map(m => m.marketId);
    if (open.length) for (const [id, i] of await infoFor(db, source, open).catch(() => new Map())) prices.set(`${source}:${id}`, i.yesPrice);
  }
  const splitBy = await splitsFor(db, moves.filter(m => m.source === "polymarket").map(m => m.marketId)).catch(() => new Map());
  const notes = await notesFor(db, moves.map(m => m.id)).catch(() => new Map<string, StoredNote>());
  return moves.map(m => {
    const n = notes.get(m.id);
    const rec = m.wallet ? recs.get(m.wallet) ?? null : null;
    const shown = p.records && hasRecord(rec) ? rec : null;
    return {
      id: m.id, analyst: n ? { text: n.text, facts: n.facts.facts, at: n.at } : null, source: m.source, tab: m.tab, league: m.league, leagueLabel: leagueLabel(m),
      sentence: moveSentence(m, shown, now - m.at < 3_600_000, now), payout: payoutLine(m), record: recordLine(shown), topTrader: isTopTrader(shown),
      amount: m.amount, at: m.at, ago: agoText(m.at, now), eventTitle: m.eventTitle, marketTitle: m.marketTitle, outcome: m.outcome, marketId: m.marketId,
      wallet: m.wallet, walletLabel: m.wallet ? walletLabel(m.wallet, m.walletName) : null,
      link: marketLink(m, region, matches.get(m.marketId) ?? null), result: m.result,
      note: m.detail ? stockNote(m.detail) : null, ticker: m.detail?.kind === "insider" ? m.detail.ticker : null,
      art: artOfMove(m),
      who: whoOf(m), face: moveFace(m, avatars), why: why.get(m.id) ?? null, sourceLink: moveSource(m),
      headline: headlineOf(m), subline: m.source === "sec" ? stockSub(m) : sublineOf({ ...m, leagueLabel: leagueLabel(m) }),
      inAt: m.source === "sec" ? null : chance(m.avgPrice), avgPrice: m.avgPrice, outcomeSide: m.outcomeSide,
      nowPrice: (() => { const y = prices.get(`${m.source}:${m.marketId}`); return y === null || y === undefined ? null : m.outcomeSide === "yes" ? y : 1 - y; })(),
      pnl: settledPnl(m), low: lowInterest(m),
      split: (() => { const s = splitBy.get(m.marketId); const x = s?.crowd ?? s?.bigmoney; return x ? splitLine(x) : null; })(),
      ...(m.source === "sec" ? { secFollows: secFollowsOf(m), companyHref: m.detail?.kind === "insider" && m.detail.ticker ? companyHref(m.detail.ticker) : null } : {}),
    };
  });
}

/** "Jen-Hsun Huang, CEO · NVDA" / "Q3 2026 holdings · BRK" under a stock headline. */
function stockSub(m: Move): string {
  const d = m.detail;
  if (!d) return m.marketTitle;
  if (d.kind === "insider") return [personName(d.ownerName), d.ticker].filter(Boolean).join(" · ");
  return d.period ? `13F, ${d.period.slice(0, 4)} holdings` : "13F holdings";
}

/** The feed query on the viewer's clock: a free viewer only gets moves older than the delay. By default the
 *  low-interest markets are left out (lib/moves/interest.ts; `all` keeps them) and bets on the same outcome within
 *  the hour are grouped (lib/moves/group.ts). `tracker` narrows to a tracker's moves (the Markets and Stocks chips). */
export async function feedFor(db: Db, plan: Plan, region: Region | null, q: MoveQuery & { all?: boolean; tracker?: string | null; group?: boolean }, now: number): Promise<FeedItem[]> {
  const delay = movePlan(plan).delayMs;
  const until = Math.min(q.until ?? now, now - delay);
  const t = q.tracker ? trackerBySlug(q.tracker) : null;
  const want = q.limit ?? 30;
  const got = await listMoves(db, { ...q, until, where: t ? trackerWhere(t) : q.where, limit: q.all ? want * 2 : want * 4 });
  const kept = q.all ? got : got.filter(m => !lowInterest(m));
  const items = await feedItems(db, kept.slice(0, want * 2), plan, region, now, until);
  return (q.group === false ? items : groupFeed(items)).slice(0, want);
}
