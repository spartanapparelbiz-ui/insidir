/* The watcher (worker watch:check, every WATCH_MS): every open watched bet is read against what happened since it was
 * last read, and the member gets an explained alert (lib/watch/alerts.ts) when
 *   a $1M+ wallet bets the other side, a wallet on their side sells, their side's price moves 5¢+ (from the price at the
 *   first read, then the last alert), or the market closes within 24 hours (once).
 * Each alert is saved to "What we told you" (terminal.told_log) and sent by push (the send the worker passes in) to a
 * paying member with push alerts on, outside their quiet hours; at most PUSH_PER_RUN per member per run. state on the
 * watched bet keeps what was already alerted (event ids, the last alerted price, the deadline).
 * Settling: once a market's result is known (Polymarket, or the results Insidir already recorded), each watched bet on
 * it gets won / lost / void, and every "What we told you" row on that market and side gets its result, losses
 * included. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { appUrl } from "@/lib/app-url";
import { inQuietHours } from "@/lib/alerts/quiet";
import { effectivePlan } from "@/lib/billing/access";
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import { walletFacts, walletName } from "@/lib/briefing/wallets";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/db/schema";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { isPaid } from "@/lib/plans";
import type { PolymarketClient } from "@/lib/exchanges";
import { alertPush, deadlineAlert, exitAlert, moveAlert, oppositeAlert, settledResult, type Held, type WatchAlert } from "./alerts";
import { randomBytes } from "node:crypto";

export const WATCH_MS = 2 * 60_000;
export const PUSH_PER_RUN = 6;
const MAX_MARKETS = 300;

export interface WatchRun { bets: number; alerts: number; pushed: number; settled: number; told: number }
interface State { seen?: string[]; lastPrice?: number; lastMoveAt?: number; deadlineSent?: boolean }
type Send = (userId: string, msg: { title: string; body: string; url: string }) => Promise<void>;
type Poly = Pick<PolymarketClient, "getMarketsById">;

const list = (xs: readonly string[]) => sql.join(xs.map(x => sql`${x}`), sql`, `);
const toldId = () => "tl_" + randomBytes(9).toString("base64url");

/** Each market's YES price, end and result: market_info, Polymarket (when given), and the results Insidir recorded. */
async function marketStates(db: Db, ids: readonly string[], poly: Poly | null): Promise<Map<string, { yes: number | null; endAt: number | null; result: "yes" | "no" | "void" | null }>> {
  const out = new Map<string, { yes: number | null; endAt: number | null; result: "yes" | "no" | "void" | null }>();
  if (!ids.length) return out;
  const infos = (await db.execute(sql`select market_id, yes_price, end_at from terminal.market_info where source = 'polymarket' and market_id in (${list(ids)})`)).rows as Array<{ market_id: string; yes_price: number | null; end_at: string | null }>;
  for (const i of infos) out.set(i.market_id, { yes: i.yes_price === null ? null : Number(i.yes_price), endAt: i.end_at ? new Date(i.end_at).getTime() : null, result: null });
  // Results already recorded: a won bet on a side means that side; a lost one, the other.
  const rec = (await db.execute(sql`select market_id, outcome_side, result from (
      select market_id, outcome_side, result from terminal.millionaire_bets where market_id in (${list(ids)}) and result in ('won', 'lost', 'void')
      union all select market_id, outcome_side, result from terminal.record_log where market_id in (${list(ids)}) and result in ('won', 'lost', 'void')) x`)).rows as Array<{ market_id: string; outcome_side: "yes" | "no"; result: string }>;
  for (const r of rec) {
    const s = out.get(r.market_id) ?? { yes: null, endAt: null, result: null };
    if (!s.result) s.result = r.result === "void" ? "void" : r.result === "won" ? r.outcome_side : r.outcome_side === "yes" ? "no" : "yes";
    out.set(r.market_id, s);
  }
  if (poly) {
    for (let i = 0; i < ids.length; i += 50) {
      const got = await poly.getMarketsById(ids.slice(i, i + 50)).catch(() => new Map());
      for (const [id, m] of got) {
        const s = out.get(id) ?? { yes: null, endAt: null, result: null };
        if (typeof m.yesPrice === "number") s.yes = m.yesPrice;
        if (s.endAt === null && typeof m.closeTime === "number") s.endAt = m.closeTime;
        if (!s.result && (m.result === "yes" || m.result === "no" || m.result === "void")) s.result = m.result;
        out.set(id, s);
      }
    }
  }
  return out;
}

/** Marks every watched bet and every "What we told you" row on a settled market. */
async function settleMarket(db: Db, marketId: string, result: "yes" | "no" | "void", now: number): Promise<number> {
  const at = new Date(now);
  const n = (await db.execute(sql`update terminal.watched_bets set result = case when ${result}::text = 'void' then 'void' when side = ${result}::text then 'won' else 'lost' end,
      settled_at = ${at}, last_price = case when ${result}::text = 'void' then last_price when side = ${result}::text then 1 else 0 end
    where market_id = ${marketId} and result is null`)).rowCount ?? 0;
  await db.execute(sql`update terminal.told_log set result = case when ${result}::text = 'void' then 'void' when side = ${result}::text then 'won' else 'lost' end, settled_at = ${at}
    where market_id = ${marketId} and side is not null and result is null`);
  return n;
}

export async function watchOnce(db: Db, now: number, o: { send?: Send; poly?: Poly | null } = {}): Promise<WatchRun> {
  const run: WatchRun = { bets: 0, alerts: 0, pushed: 0, settled: 0, told: 0 };
  const bets = (await db.execute(sql`select w.*, u.plan as u_plan, u.access_until as u_access_until, u.membership_status as u_status, u.email as u_email, u.settings as u_settings
    from terminal.watched_bets w join terminal.users u on u.id = w.user_id
    where w.result is null and w.removed_at is null order by w.checked_at asc nulls first limit 2000`)).rows as Array<Record<string, unknown>>;
  const toldOpen = ((await db.execute(sql`select distinct market_id from terminal.told_log where result is null and market_id is not null and side is not null limit ${MAX_MARKETS}`)).rows as Array<{ market_id: string }>).map(r => r.market_id);
  const ids = [...new Set([...bets.map(b => String(b.market_id)), ...toldOpen])].slice(0, MAX_MARKETS);
  const states = await marketStates(db, ids, o.poly ?? null);

  // Settle first: a settled market's bets get their result and no more alerts.
  for (const [id, s] of states) if (s.result) run.settled += await settleMarket(db, id, s.result, now);

  const pushes = new Map<string, number>();
  for (const b of bets) {
    const marketId = String(b.market_id), side = b.side as "yes" | "no", st = states.get(marketId);
    if (st?.result) continue;
    run.bets++;
    const state = (b.state ?? {}) as State;
    const seen = new Set(state.seen ?? []);
    const since = new Date(b.checked_at ? String(b.checked_at) : String(b.created_at));
    const h: Held = { title: String(b.market_title), side, sideLabel: String(b.outcome), price: Number(b.price), amount: Number(b.amount), shares: Number(b.shares) };
    const priceNow = st?.yes !== null && st?.yes !== undefined ? (side === "yes" ? st.yes : 1 - st.yes) : (b.last_price === null ? null : Number(b.last_price));
    const cat = b.category && isCategory(b.category) ? String(b.category) : null;
    const alerts: WatchAlert[] = [];

    // A $1M+ wallet bet the other side.
    const opp = (await db.execute(sql`select mb.id, mb.wallet, mb.amount, mb.price, mb.outcome, w.pnl from terminal.millionaire_bets mb left join terminal.watchlist w on w.wallet = mb.wallet
      where mb.market_id = ${marketId} and mb.outcome_side <> ${side} and mb.tier = 'millionaire' and mb.last_at > ${since} order by mb.at`)).rows as Array<{ id: string; wallet: string; amount: number; price: number; outcome: string; pnl: number | null }>;
    const freshOpp = opp.filter(x => !seen.has(x.id));
    if (freshOpp.length) {
      const facts = await walletFacts(db, freshOpp.map(x => x.wallet), cat, { since: now - 30 * 86_400_000 });
      const rec = [...facts.values()].reduce((a, f) => ({ won: a.won + (f.record?.won ?? 0), lost: a.lost + (f.record?.lost ?? 0) }), { won: 0, lost: 0 });
      const a = oppositeAlert(h, freshOpp[0]!.outcome, freshOpp.map(x => ({ wallet: x.wallet, short: shortWallet(x.wallet), amount: Number(x.amount), price: Number(x.price), pnl: x.pnl === null ? null : Number(x.pnl) })),
        rec.won + rec.lost ? rec : null, cat ? categoryInfo(cat as Parameters<typeof categoryInfo>[0]).name : null, priceNow);
      if (a) alerts.push(a);
      for (const x of freshOpp) seen.add(x.id);
    }

    // A wallet on their side sold.
    const exits = (await db.execute(sql`select e.id, e.wallet, e.tier, e.kind, e.shares, e.held_after, e.amount, e.price, e.at,
        (select min(m.at) from terminal.millionaire_bets m where m.wallet = e.wallet and m.market_id = e.market_id and m.outcome_side = e.outcome_side) as first_at
      from terminal.position_events e where e.market_id = ${marketId} and e.outcome_side = ${side} and e.kind in ('trim', 'exit') and e.last_at > ${since} order by e.at`)).rows as Array<Record<string, unknown>>;
    for (const e of exits.filter(x => !seen.has(String(x.id)))) {
      const tier = e.tier === "millionaire" ? "millionaire" : "pro";
      alerts.push(exitAlert(h, {
        wallet: String(e.wallet), walletName: walletName({ tier, short: shortWallet(String(e.wallet)) }), kind: e.kind === "exit" ? "exit" : "trim",
        shares: Number(e.shares), heldBefore: Number(e.held_after) + Number(e.shares), amount: Number(e.amount), price: Number(e.price), at: new Date(String(e.at)).getTime(),
        firstBuyAt: e.first_at ? new Date(String(e.first_at)).getTime() : null,
      }, priceNow));
      seen.add(String(e.id));
    }

    // The price moved 5¢+ since the last alert. The first read only sets the starting point: a bet added (or imported)
    // after a big move isn't news.
    if (priceNow !== null && !b.checked_at) state.lastPrice = priceNow;
    else if (priceNow !== null) {
      const from = state.lastPrice ?? h.price;
      const m = moveAlert(h, from, priceNow, state.lastMoveAt ? now - state.lastMoveAt : null);
      if (m) { alerts.push(m); state.lastPrice = priceNow; state.lastMoveAt = now; }
    }

    // Closing within 24 hours, once.
    if (!state.deadlineSent && st?.endAt) {
      const d = deadlineAlert(h, st.endAt, now, priceNow);
      if (d) { alerts.push(d); state.deadlineSent = true; }
    }

    const settings: UserSettings = { ...DEFAULT_SETTINGS, ...((b.u_settings ?? {}) as Partial<UserSettings>) };
    const plan = effectivePlan({ plan: b.u_plan as "free" | "insidir", accessUntil: b.u_access_until ? new Date(String(b.u_access_until)) : null, membershipStatus: (b.u_status as string | null) ?? null, email: (b.u_email as string | null) ?? null }, now);
    const canPush = Boolean(o.send) && isPaid(plan) && settings.alertPush && !inQuietHours(now, settings.quietStart, settings.quietEnd, settings.timeZone);
    for (const a of alerts) {
      await db.execute(sql`insert into terminal.told_log (id, user_id, kind, market_id, market_title, side, price, headline, body, facts, watch_id, created_at)
        values (${toldId()}, ${String(b.user_id)}, 'alert', ${marketId}, ${h.title}, ${side}, ${priceNow}, ${a.headline}, ${a.meaning}, ${JSON.stringify({ kind: a.kind, ...a.facts })}::jsonb, ${String(b.id)}, ${new Date(now)})`);
      run.told++; run.alerts++;
      const sent = pushes.get(String(b.user_id)) ?? 0;
      if (canPush && sent < PUSH_PER_RUN) {
        await o.send!(String(b.user_id), alertPush(a, `${appUrl()}/watch#${String(b.id)}`)).catch(() => undefined);
        pushes.set(String(b.user_id), sent + 1); run.pushed++;
      }
    }
    const next: State = { ...state, seen: [...seen].slice(-300) };
    await db.execute(sql`update terminal.watched_bets set checked_at = ${new Date(now)}, last_price = ${priceNow}, state = ${JSON.stringify(next)}::jsonb where id = ${String(b.id)}`);
  }
  return run;
}
