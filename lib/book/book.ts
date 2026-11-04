/* The Book (/book): every bet a member placed from Insidir, in one place: their one-tap copies (terminal.bet_copies)
 * and the Autopilot matches they marked placed (terminal.autopilot_matches). Open ones are marked at Kalshi's price
 * now (the side they hold); settled ones at their own fill price, losses included. Matches they haven't answered yet
 * ("Did you place it?") are listed apart and never counted. Insidir never places a bet: the member logs it. */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { autopilotMatches, betCopies, millionaireBets } from "@/lib/db/schema";
import { yesPrices } from "@/lib/copies/store";
import { twinOf } from "@/lib/entities/market";

export type Result = "won" | "lost" | "void" | null;
export interface Entry {
  key: string; kind: "copy" | "match"; id: number;
  title: string; outcome: string; side: "yes" | "no"; category: string; venue: "kalshi" | "polymarket";
  /** The member's fill price, contracts and what it cost. */
  price: number; contracts: number; cost: number;
  at: number; result: Result; settledAt: number | null;
  /** Kalshi's price now for the side held (open only), and the P&L at it. */
  mark: number | null; live: number | null;
  /** Settled P&L at the member's price. */
  pnl: number | null;
  url: string;
}

/** P&L of a settled position at its own price. Pure. */
export function settledPnl(result: Result, contracts: number, cost: number): number | null {
  if (result === "won") return round(contracts - cost);
  if (result === "lost") return round(-cost);
  if (result === "void") return 0;
  return null;
}
const round = (n: number) => Math.round(n * 100) / 100;

export interface Summary {
  open: number; settled: number; won: number; lost: number; void: number;
  exposure: number; live: number | null; net: number; staked: number;
  winRate: number | null;
  /** The average fill price of settled bets (what they needed to win, roughly) against how often they won. */
  avgEntry: number | null;
  byCategory: Array<{ category: string; exposure: number; open: number }>;
}

/** The Book's totals. Pure. */
export function summarize(entries: readonly Entry[]): Summary {
  const open = entries.filter(e => e.result === null), done = entries.filter(e => e.result !== null);
  const decided = done.filter(e => e.result === "won" || e.result === "lost");
  const cats = new Map<string, { exposure: number; open: number }>();
  for (const e of open) { const c = cats.get(e.category) ?? { exposure: 0, open: 0 }; c.exposure += e.cost; c.open++; cats.set(e.category, c); }
  const marked = open.filter(e => e.live !== null);
  return {
    open: open.length, settled: done.length, won: decided.filter(e => e.result === "won").length, lost: decided.filter(e => e.result === "lost").length,
    void: done.filter(e => e.result === "void").length,
    exposure: round(open.reduce((s, e) => s + e.cost, 0)),
    live: marked.length ? round(marked.reduce((s, e) => s + e.live!, 0)) : null,
    net: round(done.reduce((s, e) => s + (e.pnl ?? 0), 0)),
    staked: round(decided.reduce((s, e) => s + e.cost, 0)),
    winRate: decided.length ? decided.filter(e => e.result === "won").length / decided.length : null,
    avgEntry: decided.length ? decided.reduce((s, e) => s + e.price * e.cost, 0) / Math.max(1e-9, decided.reduce((s, e) => s + e.cost, 0)) : null,
    byCategory: [...cats].map(([category, c]) => ({ category, exposure: round(c.exposure), open: c.open })).sort((a, b) => b.exposure - a.exposure),
  };
}

export type Pending = typeof autopilotMatches.$inferSelect;

/** The member's Book: entries newest first, and the Autopilot matches waiting for "placed or skipped". */
export async function bookFor(db: Db, userId: string, now = Date.now()): Promise<{ entries: Entry[]; pending: Pending[] }> {
  const [copies, matches] = await Promise.all([
    db.select().from(betCopies).where(eq(betCopies.userId, userId)).orderBy(desc(betCopies.createdAt)).limit(500),
    db.select().from(autopilotMatches).where(and(eq(autopilotMatches.userId, userId), inArray(autopilotMatches.status, ["sent", "quiet"]))).orderBy(desc(autopilotMatches.matchedAt)).limit(500),
  ]);
  // Kalshi's price now: matches carry their Kalshi market; copies use their market's approved twin.
  const twins = await twinOf(db, [...new Set(copies.map(c => c.marketId))]).catch(() => new Map());
  // Copies don't store a category: their bet does.
  const cat = new Map(copies.length ? (await db.select({ id: millionaireBets.id, category: millionaireBets.category }).from(millionaireBets)
    .where(inArray(millionaireBets.id, copies.map(c => c.betId)))).map(b => [b.id, b.category]) : []);
  const kIds = [...new Set([...matches.map(m => m.kalshiId), ...[...twins.values()].map(t => t.kalshiId)])];
  const yes = await yesPrices(db, "kalshi", kIds).catch(() => new Map<string, number>());
  const markOf = (kalshiId: string | undefined, side: "yes" | "no") => { const y = kalshiId ? yes.get(kalshiId) : undefined; return y === undefined ? null : side === "yes" ? y : 1 - y; };

  const entries: Entry[] = [];
  for (const c of copies) {
    const contracts = c.price > 0 ? c.amount / c.price : 0, result = (c.result ?? null) as Result;
    const mark = result === null ? markOf(twins.get(c.marketId)?.kalshiId, c.outcomeSide) : null;
    entries.push({ key: `c${c.id}`, kind: "copy", id: c.id, title: c.title, outcome: c.outcome, side: c.outcomeSide, category: cat.get(c.betId) ?? "world", venue: c.venue,
      price: c.price, contracts: round(contracts), cost: c.amount, at: c.createdAt.getTime(), result, settledAt: c.settledAt?.getTime() ?? null,
      mark, live: mark !== null ? round(contracts * mark - c.amount) : null, pnl: c.pnl ?? settledPnl(result, contracts, c.amount), url: `/copy/${encodeURIComponent(c.betId)}` });
  }
  const pending: Pending[] = [];
  for (const m of matches) {
    // Unanswered: asked until it settles, for a week at most.
    if (m.memberStatus === null) { if (m.result === null && m.matchedAt.getTime() > now - 7 * 86_400_000) pending.push(m); continue; }
    if (m.memberStatus !== "placed" || !m.contracts) continue;
    const price = m.fillPrice ?? m.limitPrice ?? m.ask ?? 0, cost = round(m.contracts * price), result = (m.result ?? null) as Result;
    const mark = result === null ? markOf(m.kalshiId, m.side) : null;
    entries.push({ key: `m${m.id}`, kind: "match", id: m.id, title: m.title, outcome: m.outcome, side: m.side, category: m.category, venue: "kalshi",
      price, contracts: m.contracts, cost, at: m.matchedAt.getTime(), result, settledAt: m.settledAt?.getTime() ?? null,
      mark, live: mark !== null ? round(m.contracts * mark - cost) : null, pnl: settledPnl(result, m.contracts, cost), url: `/t/${m.id}` });
  }
  entries.sort((a, b) => b.at - a.at);
  return { entries, pending };
}

/** Marks an Autopilot match placed (with the member's fill price, default the limit) or skipped. Own matches only. */
export async function markMatch(db: Db, userId: string, id: number, status: "placed" | "skipped", fill: number | null): Promise<boolean> {
  const price = fill !== null && fill > 0 && fill < 1 ? Math.round(fill * 100) / 100 : null;
  const r = await db.update(autopilotMatches).set({ memberStatus: status, fillPrice: status === "placed" ? price : null })
    .where(and(eq(autopilotMatches.id, id), eq(autopilotMatches.userId, userId), inArray(autopilotMatches.status, ["sent", "quiet"]))).returning({ id: autopilotMatches.id });
  return r.length > 0;
}

/** Corrects a copy's fill price (settled ones are re-settled at it). Own copies only. */
export async function correctCopy(db: Db, userId: string, id: number, fill: number): Promise<boolean> {
  if (!(fill > 0 && fill < 1)) return false;
  const c = (await db.select().from(betCopies).where(and(eq(betCopies.id, id), eq(betCopies.userId, userId))).limit(1))[0];
  if (!c) return false;
  const price = Math.round(fill * 100) / 100, pnl = settledPnl((c.result ?? null) as Result, c.amount / price, c.amount);
  await db.update(betCopies).set({ price, pnl }).where(eq(betCopies.id, id));
  return true;
}
