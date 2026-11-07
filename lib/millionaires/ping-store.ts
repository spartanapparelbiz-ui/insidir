/* The database side of millionaire pings (lib/millionaires/pings.ts): members who can get one, the fresh $25K+
 * millionaire bets (opens and adds) and sells (trims and exits, on twinned markets), each one's price now, and the
 * Kalshi record of the buy pings. Server only. */
import { inArray, sql } from "drizzle-orm";
import { effectivePlan } from "@/lib/billing/access";
import type { Db } from "@/lib/db";
import { DEFAULT_SETTINGS, kalshiPings, pushSubscriptions, users } from "@/lib/db/schema";
import { marketPath } from "@/lib/entities/slug";
import { soldShare } from "./positions";
import { isPaid } from "@/lib/plans";
import { kalshiSidePrice, PING_MIN, type PingBet, type PingUser } from "./pings";

/** Paid members with push on and a device, their categories, quiet hours and pings in the last 24 hours. */
export async function pingUsers(db: Db, now: number): Promise<PingUser[]> {
  const rows = (await db.select().from(users)).map(u => ({ ...u, plan: effectivePlan(u) })).filter(u => isPaid(u.plan));
  if (!rows.length) return [];
  const ids = rows.map(u => u.id);
  const subs = new Set((await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids))).map(s => s.userId));
  const sent = new Map(((await db.execute(sql`select user_id, count(*)::int as n from terminal.alerts_sent
    where opp_id like 'mil:%' and channel = 'push' and sent_at > ${new Date(now - 86_400_000)} group by user_id`)).rows as Array<{ user_id: string; n: number }>).map(r => [r.user_id, r.n]));
  return rows.map(u => {
    const s = { ...DEFAULT_SETTINGS, ...u.settings };
    return { id: u.id, push: s.alertPush && subs.has(u.id), cats: s.go?.categories ?? [], quietStart: s.quietStart, quietEnd: s.quietEnd, timeZone: s.timeZone, sentLast24h: sent.get(u.id) ?? 0 };
  });
}

/** Millionaire-tier bets of PING_MIN+ first seen in the last `windowMs`, newest first, with the wallet's profit. */
export async function freshBigBets(db: Db, now: number, windowMs = 10 * 60_000): Promise<PingBet[]> {
  const r = await db.execute(sql`select b.id, b.market_id, b.tier, b.amount::float as amount, b.category, b.market_title, b.outcome, b.outcome_side, b.yes_label, b.no_label,
      b.price::float as price, w.pnl::float as pnl, pe.kind
    from terminal.millionaire_bets b left join terminal.watchlist w on w.wallet = b.wallet
      left join terminal.position_events pe on pe.id = b.id
    where b.tier = 'millionaire' and b.amount >= ${PING_MIN} and b.at > ${new Date(now - windowMs)} and b.result is null order by b.at desc limit 50`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({ id: String(x.id), marketId: String(x.market_id), side: x.outcome_side === "no" ? "no" as const : "yes" as const, tier: String(x.tier), amount: Number(x.amount), category: String(x.category), title: String(x.market_title),
    outcome: String(x.outcome), price: Number(x.price), pnl: x.pnl === null ? null : Number(x.pnl), kind: x.kind === "add" ? "add" as const : "open" as const }));
}

/** The side's price now (market_info), by bet. */
export async function pricesNow(db: Db, betIds: readonly string[]): Promise<Map<string, number>> {
  if (!betIds.length) return new Map();
  const r = await db.execute(sql`select b.id, case when b.outcome_side = 'yes' then i.yes_price else 1 - i.yes_price end as p
    from terminal.millionaire_bets b join terminal.market_info i on i.source = 'polymarket' and i.market_id = b.market_id
    where b.id in (${sql.join(betIds.map(i => sql`${i}`), sql`, `)}) and i.yes_price is not null`);
  return new Map((r.rows as Array<{ id: string; p: number }>).map(x => [x.id, Number(x.p)]));
}

/** Millionaire-tier sells of PING_MIN+ (trims and exits) in the last `windowMs` on markets with an approved Kalshi twin,
 *  newest first: the share of the position sold and the market's page to open. */
export async function freshBigSells(db: Db, now: number, windowMs = 10 * 60_000): Promise<PingBet[]> {
  const r = await db.execute(sql`select e.id, e.market_id, e.tier, e.amount, e.category, e.market_title, e.outcome, e.outcome_side, e.price, e.kind, e.shares, e.held_after, w.pnl::float as pnl
    from terminal.position_events e left join terminal.watchlist w on w.wallet = e.wallet
    where e.kind in ('trim', 'exit') and e.tier = 'millionaire' and e.amount >= ${PING_MIN} and e.at > ${new Date(now - windowMs)}
      and exists (select 1 from terminal.market_twins t where t.polymarket_id = e.market_id and t.status = 'approved')
    order by e.at desc limit 50`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({ id: String(x.id), marketId: String(x.market_id), side: x.outcome_side === "no" ? "no" as const : "yes" as const, tier: String(x.tier),
    amount: Number(x.amount), category: String(x.category), title: String(x.market_title), outcome: String(x.outcome), price: Number(x.price), pnl: x.pnl === null ? null : Number(x.pnl),
    kind: x.kind === "exit" ? "exit" as const : "trim" as const, sold: soldShare(Number(x.shares), Number(x.held_after)), path: marketPath(String(x.market_id), String(x.market_title)) }));
}

/** The Kalshi record (/results): each buy ping (an open or an add) on a market with a Kalshi twin and Kalshi's price for
 *  that side, kept once, at the moment it was first pinged. */
export async function recordKalshiPings(db: Db, bets: readonly PingBet[], twins: ReadonlyMap<string, { kalshiId: string; yes: number | null; noAsk?: number | null }>, now: number): Promise<number> {
  let n = 0;
  for (const b of bets) {
    if (b.kind === "trim" || b.kind === "exit" || !b.marketId) continue;
    const t = twins.get(b.marketId);
    if (!t) continue;
    const kp = kalshiSidePrice(t, b.side);
    if (kp === null || !(kp > 0 && kp < 1)) continue;
    const r = await db.insert(kalshiPings).values({ eventId: b.id, marketId: b.marketId, kalshiId: t.kalshiId, outcomeSide: b.side ?? "yes", kind: b.kind === "add" ? "add" : "open",
      title: b.title, outcome: b.outcome, category: b.category, polyPrice: b.price, kalshiPrice: kp, at: new Date(now) }).onConflictDoNothing().returning({ id: kalshiPings.eventId });
    n += r.length;
  }
  return n;
}