/* The database side of millionaire pings (lib/millionaires/pings.ts): members who can get one, the fresh $25K+
 * millionaire bets, and each one's price now. Server only. */
import { inArray, sql } from "drizzle-orm";
import { effectivePlan } from "@/lib/billing/access";
import type { Db } from "@/lib/db";
import { DEFAULT_SETTINGS, pushSubscriptions, users } from "@/lib/db/schema";
import { isPaid } from "@/lib/plans";
import { PING_MIN, type PingBet, type PingUser } from "./pings";

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
  const r = await db.execute(sql`select b.id, b.tier, b.amount::float as amount, b.category, b.market_title, b.outcome, b.outcome_side, b.yes_label, b.no_label,
      b.price::float as price, w.pnl::float as pnl
    from terminal.millionaire_bets b left join terminal.watchlist w on w.wallet = b.wallet
    where b.tier = 'millionaire' and b.amount >= ${PING_MIN} and b.at > ${new Date(now - windowMs)} and b.result is null order by b.at desc limit 50`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({ id: String(x.id), tier: String(x.tier), amount: Number(x.amount), category: String(x.category), title: String(x.market_title),
    outcome: String(x.outcome), price: Number(x.price), pnl: x.pnl === null ? null : Number(x.pnl) }));
}

/** The side's price now (market_info), by bet. */
export async function pricesNow(db: Db, betIds: readonly string[]): Promise<Map<string, number>> {
  if (!betIds.length) return new Map();
  const r = await db.execute(sql`select b.id, case when b.outcome_side = 'yes' then i.yes_price else 1 - i.yes_price end as p
    from terminal.millionaire_bets b join terminal.market_info i on i.source = 'polymarket' and i.market_id = b.market_id
    where b.id in (${sql.join(betIds.map(i => sql`${i}`), sql`, `)}) and i.yes_price is not null`);
  return new Map((r.rows as Array<{ id: string; p: number }>).map(x => [x.id, Number(x.p)]));
}
