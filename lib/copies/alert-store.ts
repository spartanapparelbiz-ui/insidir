/* The database side of the copy-trading pushes (lib/copies/alerts.ts), for worker copy:alerts. Server only.
 *   entryJobs  each buy of $1K+ in the last ALERT_WINDOW_MS by a wallet a paid member follows (terminal.follows,
 *              kind trader), with the wallet's Verified row (bankroll for sizing), its profit, and both venues' price
 *   exitJobs   each trim or exit in the window on a position a member copied (bet_copies by wallet, market and side,
 *              not skipped, not settled)
 *   dropJobs   each placed, open copy whose side's price is the member's set number of cents under their entry */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/db/schema";
import { twinOf } from "@/lib/entities/market";
import { soldShare } from "@/lib/millionaires/positions";
import { pingUsers } from "@/lib/millionaires/ping-store";
import { inQuietHours } from "@/lib/alerts/quiet";
import { dropDue, type CopyRef, type EntryTrade, type ExitEvent, type VenuePrices } from "./alerts";
import { validCopySettings, type CopySettings } from "./sizing";

export const ALERT_WINDOW_MS = 10 * 60_000;
type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Paid members who can get a push now (push on, a device, outside quiet hours), with their copy settings. */
async function reachable(db: Db, now: number): Promise<Map<string, CopySettings | null>> {
  const us = (await pingUsers(db, now)).filter(u => u.push && !inQuietHours(now, u.quietStart, u.quietEnd, u.timeZone));
  if (!us.length) return new Map();
  const r = await db.execute(sql`select id, settings from terminal.users where id in (${sql.join(us.map(u => sql`${u.id}`), sql`, `)})`);
  return new Map((r.rows as Row[]).map(x => [String(x.id), validCopySettings(({ ...DEFAULT_SETTINGS, ...(x.settings as UserSettings) }).copy ?? null)]));
}

/** Both venues' price for a side, by Polymarket market: market_info's Polymarket price, Kalshi's ask on an approved twin. */
export async function venuePrices(db: Db, items: ReadonlyArray<{ marketId: string; side: "yes" | "no" }>): Promise<Map<string, VenuePrices>> {
  const ids = [...new Set(items.map(i => i.marketId))];
  if (!ids.length) return new Map();
  const [poly, twins] = await Promise.all([
    db.execute(sql`select market_id, yes_price from terminal.market_info where source = 'polymarket' and closed = false and market_id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`),
    twinOf(db, ids).catch(() => new Map()),
  ]);
  const py = new Map((poly.rows as Row[]).map(x => [String(x.market_id), num(x.yes_price)]));
  const out = new Map<string, VenuePrices>();
  for (const i of items) {
    const y = py.get(i.marketId) ?? null, t = twins.get(i.marketId);
    const k = t ? (i.side === "yes" ? t.yesAsk ?? t.yes : t.noAsk ?? (t.yes !== null ? 1 - t.yes : null)) : null;
    out.set(`${i.marketId}:${i.side}`, { polymarket: y === null ? null : i.side === "yes" ? y : 1 - y, kalshi: k ?? null });
  }
  return out;
}

export async function entryJobs(db: Db, now: number): Promise<Array<{ userId: string; trade: EntryTrade; side: "yes" | "no"; marketId: string; bankroll: number | null; mine: CopySettings | null }>> {
  const users = await reachable(db, now);
  if (!users.size) return [];
  const r = await db.execute(sql`select b.id, b.wallet, b.market_id, b.market_title, b.outcome, b.outcome_side, b.amount::float as amount, b.price::float as price,
      w.pnl::float as pnl, v.verified, v.bankroll::float as bankroll, f.user_id
    from terminal.millionaire_bets b
      join terminal.follows f on f.kind = 'trader' and f.target = b.wallet
      left join terminal.watchlist w on w.wallet = b.wallet left join terminal.wallet_verification v on v.wallet = b.wallet
    where b.at > ${new Date(now - ALERT_WINDOW_MS)} and b.result is null
      and f.user_id in (${sql.join([...users.keys()].map(u => sql`${u}`), sql`, `)})
    order by b.at desc limit 200`);
  return (r.rows as Row[]).map(x => ({
    userId: String(x.user_id), marketId: String(x.market_id), side: x.outcome_side === "no" ? "no" as const : "yes" as const, bankroll: num(x.bankroll), mine: users.get(String(x.user_id)) ?? null,
    trade: { id: String(x.id), wallet: String(x.wallet), pnl: num(x.pnl), verified: x.verified === true, title: String(x.market_title), outcome: String(x.outcome), amount: Number(x.amount), price: Number(x.price) },
  }));
}

export async function exitJobs(db: Db, now: number): Promise<Array<{ userId: string; event: ExitEvent; copy: CopyRef; wallet: string }>> {
  const users = await reachable(db, now);
  if (!users.size) return [];
  const r = await db.execute(sql`select e.id as event_id, e.wallet, e.kind, e.price::float as price, e.shares::float as shares, e.held_after::float as held_after,
      c.id, c.user_id, c.outcome, c.title, c.price::float as entry
    from terminal.position_events e
      join terminal.bet_copies c on c.wallet = e.wallet and c.market_id = e.market_id and c.outcome_side = e.outcome_side
    where e.kind in ('trim', 'exit') and e.at > ${new Date(now - ALERT_WINDOW_MS)} and e.at > c.created_at
      and c.status <> 'skipped' and c.result is null and c.user_id in (${sql.join([...users.keys()].map(u => sql`${u}`), sql`, `)})
    order by e.at desc limit 200`);
  return (r.rows as Row[]).map(x => ({
    userId: String(x.user_id), wallet: String(x.wallet),
    event: { id: String(x.event_id), kind: x.kind === "exit" ? "exit" as const : "trim" as const, sold: x.kind === "exit" ? 1 : soldShare(Number(x.shares), Number(x.held_after)), price: Number(x.price) },
    copy: { id: Number(x.id), outcome: String(x.outcome), title: String(x.title), entry: Number(x.entry) },
  }));
}

export async function dropJobs(db: Db, now: number): Promise<Array<{ userId: string; copy: CopyRef; price: number }>> {
  const users = await reachable(db, now);
  const wants = [...users.entries()].filter(([, s]) => s?.dropCents);
  if (!wants.length) return [];
  const r = await db.execute(sql`select c.id, c.user_id, c.market_id, c.outcome_side, c.outcome, c.title, c.venue, c.price::float as entry from terminal.bet_copies c
    where c.status = 'placed' and c.result is null and c.drop_pinged_at is null and c.user_id in (${sql.join(wants.map(([u]) => sql`${u}`), sql`, `)})`);
  const rows = r.rows as Row[];
  const prices = await venuePrices(db, rows.map(x => ({ marketId: String(x.market_id), side: x.outcome_side === "no" ? "no" as const : "yes" as const })));
  const out: Array<{ userId: string; copy: CopyRef; price: number }> = [];
  for (const x of rows) {
    // The price on the venue they copied on (their entry is that venue's price).
    const vp = prices.get(`${x.market_id}:${x.outcome_side === "no" ? "no" : "yes"}`), p = (x.venue === "kalshi" ? vp?.kalshi : vp?.polymarket) ?? null;
    if (dropDue(Number(x.entry), p, users.get(String(x.user_id))?.dropCents ?? null)) out.push({ userId: String(x.user_id), copy: { id: Number(x.id), outcome: String(x.outcome), title: String(x.title), entry: Number(x.entry) }, price: p! });
  }
  return out;
}
