/* Copy the winners (server only).
 *   Copyable   a Polymarket wallet or a tracker with MIN_SETTLED+ settled positions, ranked by followable return
 *              (lib/follow: the price Insidir showed + 1 point, held to settlement).
 *   A copy     a follow of kind "trader" (a wallet) or "tracker"; it began at the follow's created_at.
 *   New moves  every position from a copied wallet or tracker that Insidir showed after the copy began: the price
 *              they got, the price you can still get, a one-line analyst note, and where to open it. In the US (or an
 *              unknown region) a Polymarket move opens the matched Kalshi market (lib/matching pairs) at Kalshi's
 *              price; with no match it is view-only, never a Polymarket link. Elsewhere it opens on Polymarket.
 *              Nothing is ever traded for anyone.
 *   P&L        each copy's settled moves since it began, at the member's size (lib/copies/math.ts).
 * Wallets are shown by their short address only ("0x4f…c2"): nothing about who is behind one. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { notesFor } from "@/lib/analyst/store";
import type { Db } from "@/lib/db";
import { follows, moves as movesT } from "@/lib/db/schema";
import { liveTabs } from "@/lib/features";
import { MIN_SETTLED, type FollowRecord } from "@/lib/follow/math";
import { trackerFollowAll, traderFollowAll } from "@/lib/follow/records";
import { infoFor } from "@/lib/markets/info";
import { notComboSql } from "@/lib/moves/combos";
import { headlineOf, sublineOf } from "@/lib/moves/headline";
import { leagueLabel } from "@/lib/moves/leagues";
import { shortWallet } from "@/lib/moves/records";
import { fromRow } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { TRACKERS, trackerBySlug, trackerWhere, visibleTrackers, type Tracker } from "@/lib/trackers";
import { isReady } from "@/lib/features";
import type { Region } from "@/lib/types";
import { copyResult, kalshiSide, sidePrice, type CopyResult, type SettledMove } from "./math";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export type CopyKind = "trader" | "tracker";
export interface Copyable { kind: CopyKind; target: string; label: string; line: string | null; record: FollowRecord; roi: number }

/** Every copyable wallet and tracker, best followable return first. */
export async function copyable(db: Db, now: number): Promise<Copyable[]> {
  const [traders, trackers] = await Promise.all([traderFollowAll(db, now).catch(() => new Map()), trackerFollowAll(db, now).catch(() => new Map())]);
  const out: Copyable[] = [];
  for (const t of traders.values()) {
    const r = t.all as FollowRecord;
    if (r.n >= MIN_SETTLED && r.staked > 0) out.push({ kind: "trader", target: t.wallet, label: shortWallet(t.wallet), line: null, record: r, roi: r.net / r.staked });
  }
  const shown = new Set(visibleTrackers(isReady).map(t => t.slug));
  for (const t of TRACKERS) {
    const r = (trackers.get(t.slug) as Record<string, FollowRecord> | undefined)?.all;
    if (t.kind !== "bets" || !shown.has(t.slug) || !r || r.n < MIN_SETTLED || !(r.staked > 0)) continue;
    out.push({ kind: "tracker", target: t.slug, label: t.name, line: t.line, record: r, roi: r.net / r.staked });
  }
  return out.sort((a, b) => b.roi - a.roi || b.record.n - a.record.n);
}

export interface Copy { kind: CopyKind; target: string; label: string; since: number }

const copyLabel = (kind: CopyKind, target: string): string => (kind === "trader" ? shortWallet(target) : trackerBySlug(target)?.name ?? target);

/** A member's copies, oldest first. */
export async function copiesOf(db: Db, userId: string): Promise<Copy[]> {
  const rows = await db.select({ kind: follows.kind, target: follows.target, at: follows.createdAt }).from(follows)
    .where(and(eq(follows.userId, userId), inArray(follows.kind, ["trader", "tracker"])));
  return rows.filter(r => r.kind === "trader" || trackerBySlug(r.target))
    .map(r => ({ kind: r.kind as CopyKind, target: r.target, label: copyLabel(r.kind as CopyKind, r.target), since: r.at.getTime() }))
    .sort((a, b) => a.since - b.since);
}

const T = sql`terminal.moves`;
const base = () => sql`${T}.hidden_at is null and ${notComboSql} and ${T}.source in ('polymarket', 'kalshi')
  and ${T}.tab in (${sql.join(liveTabs().map(t => sql`${t}`), sql`, `)})`;
/** A copy's moves: the wallet's, or the tracker's rule; shown at or after the copy began. */
function copyWhere(c: Copy): ReturnType<typeof sql> {
  const since = sql`coalesce(${T}.seen_at, ${T}.created_at) >= ${new Date(c.since)}`;
  if (c.kind === "trader") return sql`(${T}.wallet = ${c.target} and ${since})`;
  const t = trackerBySlug(c.target) as Tracker;
  return sql`(${trackerWhere(t)} and ${since})`;
}

export interface CopyMove {
  id: string;
  /** Which of the member's copies it came from. */
  from: { kind: CopyKind; target: string; label: string };
  headline: string;
  subline: string;
  amount: number;
  at: number;
  /** The price they got, 0..1. */
  theirPrice: number;
  /** The price you can still get on the venue you'd open, 0..1; null when unknown or view-only. */
  yourPrice: number | null;
  /** Where Open goes: Kalshi (the move's own, or the match for a US member) or Polymarket (outside the US); null when
   *  view-only. */
  open: { venue: "kalshi" | "polymarket"; href: string } | null;
  note: string | null;
  result: Move["result"];
}

interface Match { kalshiId: string; url: string; inverted: boolean }
/** Polymarket market → its Kalshi twin. Only twins a person approved in /admin/twins (lib/twins): the same event,
 *  outcome, line, resolution source and close date, YES for YES (so never inverted). */
export async function kalshiMatchesFull(db: Db, polyIds: readonly string[]): Promise<Map<string, Match>> {
  const ids = [...new Set(polyIds)];
  if (!ids.length) return new Map();
  const r = await db.execute(sql`select polymarket_id as poly, kalshi_id as kalshi, kalshi_url as url from terminal.market_twins
    where status = 'approved' and polymarket_id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`);
  return new Map((r.rows as Array<{ poly: string; kalshi: string; url: string }>).map(x => [x.poly, { kalshiId: x.kalshi, url: x.url, inverted: false }]));
}

/** YES prices: market_info first (kept fresh for markets with moves), else the matcher's market snapshot. */
export async function yesPrices(db: Db, venue: "polymarket" | "kalshi", ids: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  for (const [id, i] of await infoFor(db, venue, ids)) if (i.yesPrice !== null && i.yesPrice !== undefined && !i.closed) out.set(id, i.yesPrice);
  const missing = [...new Set(ids)].filter(i => !out.has(i));
  if (missing.length) {
    const r = await db.execute(sql`select id, (data->>'yesPrice')::float as p from terminal.markets where venue = ${venue}
      and coalesce((data->>'active')::boolean, true) and id in (${sql.join(missing.map(i => sql`${i}`), sql`, `)})`);
    for (const x of r.rows as Array<{ id: string; p: number | null }>) if (x.p !== null && Number.isFinite(x.p)) out.set(x.id, x.p);
  }
  return out;
}

/** Where a copied move opens and at what price, for this member's region. Pure. */
export function openFor(m: Pick<Move, "source" | "url" | "marketId" | "outcomeSide">, region: Region | null, match: Match | undefined,
  polyYes: Map<string, number>, kalshiYes: Map<string, number>): { open: CopyMove["open"]; yourPrice: number | null } {
  if (m.source === "kalshi") return { open: m.url ? { venue: "kalshi", href: m.url } : null, yourPrice: sidePrice(kalshiYes.get(m.marketId), m.outcomeSide) };
  if (region === "non_us") return { open: m.url ? { venue: "polymarket", href: m.url } : null, yourPrice: sidePrice(polyYes.get(m.marketId), m.outcomeSide) };
  // The US, or a region we don't know: Kalshi's matched market, else view-only. Never a Polymarket link.
  if (!match) return { open: null, yourPrice: null };
  return { open: { venue: "kalshi", href: match.url }, yourPrice: sidePrice(kalshiYes.get(match.kalshiId), kalshiSide(m.outcomeSide, match.inverted)) };
}

/** A note names a wallet by the short address, never by its account name. Pure. */
export function byAddress(note: string | null, m: Pick<Move, "wallet" | "walletName">): string | null {
  if (!note || !m.wallet || !m.walletName?.trim()) return note;
  return note.split(m.walletName.trim()).join(shortWallet(m.wallet));
}

/** New moves from a member's copies, newest first. */
export async function copyMoves(db: Db, copies: readonly Copy[], region: Region | null, now: number, limit = 40): Promise<CopyMove[]> {
  if (!copies.length) return [];
  const rows = await db.select().from(movesT).where(sql`${base()} and ${T}.at <= ${new Date(now)} and (${sql.join(copies.map(copyWhere), sql` or `)})`)
    .orderBy(sql`${T}.at desc`).limit(limit);
  const ms = rows.map(fromRow);
  const poly = ms.filter(m => m.source === "polymarket").map(m => m.marketId);
  const matches = region === "non_us" ? new Map<string, Match>() : await kalshiMatchesFull(db, poly);
  const [polyYes, kalshiYes, notes] = await Promise.all([
    region === "non_us" ? yesPrices(db, "polymarket", poly) : Promise.resolve(new Map<string, number>()),
    yesPrices(db, "kalshi", [...ms.filter(m => m.source === "kalshi").map(m => m.marketId), ...[...matches.values()].map(x => x.kalshiId)]),
    notesFor(db, ms.map(m => m.id)).catch(() => new Map()),
  ]);
  return ms.map(m => {
    const c = copies.find(c => (c.kind === "trader" ? m.wallet === c.target : (m.trackers ?? []).includes(c.target))) ?? copies.find(c => c.kind === "tracker")!;
    const o = openFor(m, region, matches.get(m.marketId), polyYes, kalshiYes);
    return {
      id: m.id, from: { kind: c.kind, target: c.target, label: c.label }, headline: headlineOf(m), subline: sublineOf({ ...m, leagueLabel: leagueLabel(m) }),
      amount: m.amount, at: m.at, theirPrice: m.avgPrice, yourPrice: o.yourPrice, open: o.open, note: byAddress(notes.get(m.id)?.text ?? null, m), result: m.result,
    };
  });
}

export interface CopyPnl { copy: Copy; week: CopyResult; total: CopyResult; open: number }

/** Each copy's settled result at `size`: this week and since it began, plus how many of its moves are still open. */
export async function copyPnl(db: Db, copies: readonly Copy[], size: number, now: number): Promise<CopyPnl[]> {
  return Promise.all(copies.map(async c => {
    const r = await db.execute(sql`select ${T}.seen_price as p, extract(epoch from coalesce(${T}.seen_at, ${T}.created_at)) * 1000 as s,
        ${T}.result as result, extract(epoch from ${T}.settled_at) * 1000 as t
      from terminal.moves where ${base()} and ${copyWhere(c)} limit 20000`);
    const rows: SettledMove[] = (r.rows as Array<{ p: number | null; s: number; result: SettledMove["result"]; t: number | null }>)
      .map(x => ({ seenPrice: x.p === null ? null : Number(x.p), seenAt: Number(x.s), result: x.result, settledAt: x.t === null ? null : Number(x.t) }));
    return { copy: c, week: copyResult(rows, size, c.since, Math.max(c.since, now - WEEK)), total: copyResult(rows, size, c.since), open: rows.filter(x => x.result === null).length };
  }));
}

/** "The field" for the weekly recap: every position Insidir showed and settled this week, copied the same way. */
export async function fieldWeek(db: Db, size: number, now: number): Promise<CopyResult> {
  const since = now - WEEK;
  const r = await db.execute(sql`select ${T}.seen_price as p, extract(epoch from coalesce(${T}.seen_at, ${T}.created_at)) * 1000 as s,
      ${T}.result as result, extract(epoch from ${T}.settled_at) * 1000 as t
    from terminal.moves where ${base()} and ${T}.settled_at >= ${new Date(since)} and ${T}.settled_at <= ${new Date(now)}`);
  const rows: SettledMove[] = (r.rows as Array<{ p: number | null; s: number; result: SettledMove["result"]; t: number | null }>)
    .map(x => ({ seenPrice: x.p === null ? null : Number(x.p), seenAt: Number(x.s), result: x.result, settledAt: x.t === null ? null : Number(x.t) }));
  return copyResult(rows, size, 0, since);
}

