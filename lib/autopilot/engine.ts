/* The Autopilot engine (worker job autopilot, every few seconds). For each wallet move recorded in the last few
 * minutes (terminal.position_events):
 *   buys (open, add)    every active rule it matches, on a market with an approved Kalshi twin, gets one row in
 *                       terminal.autopilot_matches: the finished Kalshi ticket (side, limit = min(rule max, Kalshi
 *                       ask), whole contracts for the stake) pushed to the member, or the reason it wasn't: the price
 *                       moved past the guard ("Skipped: they paid 61¢, Kalshi is 70¢ now"), the cap is used up, or
 *                       quiet hours (logged, not pushed)
 *   sells (trim, exit)  every open match on that wallet, market and side gets "They're getting out", once per sale;
 *                       an exit closes the match's paper position at Kalshi's bid
 * Matches settle with the wallet's bet (settleMatches). Insidir never places a bet: the member does, on Kalshi. */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { autopilotMatches, autopilotRules, DEFAULT_SETTINGS, users } from "@/lib/db/schema";
import { effectivePlan } from "@/lib/billing/access";
import { isPaid } from "@/lib/plans";
import { inQuietHours, localDayAndWeekStart } from "@/lib/alerts/quiet";
import { approvedTwins } from "@/lib/twins/store";
import { cleanSpec, mismatch, stakeLeft, ticketFor, tooLate, type Move, type RuleSpec } from "./rules";

export const ENGINE_WINDOW_MS = 15 * 60_000;

export interface Quote { yesAsk: number | null; noAsk: number | null; yesBid: number | null; noBid: number | null }
export interface Push { title: string; body: string; url: string }
export interface EngineDeps {
  /** Kalshi's best prices for a market, or null. */
  quote(kalshiId: string): Promise<Quote | null>;
  /** Sends to all of a member's devices. */
  push(userId: string, msg: Push): Promise<void>;
  /** Claims a one-off push (user, key) exactly once. */
  claim(userId: string, key: string): Promise<boolean>;
  appUrl: string;
}

const cents = (p: number) => `${Math.round(p * 100)}¢`;
const money = (n: number) => n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
/** "Sent 6s after the trade". Pure. */
export const sentAfter = (ms: number) => `Sent ${ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}s` : `${Math.round(ms / 60_000)} min`} after the trade`;

/** The push for a match. Pure. */
export function matchPush(m: { id: number; ruleName: string; outcome: string; side: "yes" | "no"; contracts: number; limit: number; theirPrice: number; amount: number; latencyMs: number }, appUrl: string): Push {
  return { title: `Autopilot · ${m.ruleName}`, url: `${appUrl}/t/${m.id}`,
    body: `${m.outcome} (${m.side === "yes" ? "Yes" : "No"}) on Kalshi: ${m.contracts} at ${cents(m.limit)} limit. A proven wallet put ${money(m.amount)} on it at ${cents(m.theirPrice)}. ${sentAfter(m.latencyMs)}.` };
}

/** The push when the wallet behind a member's match sells. Pure. */
export function exitPush(m: { id: number; outcome: string; kind: "trim" | "exit"; sold: number; bid: number | null }, appUrl: string): Push {
  const what = m.kind === "exit" ? "sold out" : `sold about ${Math.round(m.sold * 100)}% of it`;
  return { title: "They're getting out", url: `${appUrl}/t/${m.id}`,
    body: `The wallet behind your ${m.outcome} match ${what}.${m.bid !== null ? ` Kalshi's bid: ${cents(m.bid)}.` : ""}` };
}

interface EventRow extends Move { lastAt: number; heldAfter: number; shares: number }

async function freshEvents(db: Db, now: number): Promise<EventRow[]> {
  const r = await db.execute(sql`select pe.*, w.tier as wtier, coalesce(w.settled, tr.resolved) as settled,
      (select count(distinct p2.wallet)::int from terminal.position_events p2 join terminal.watchlist w2 on w2.wallet = p2.wallet and w2.tier = 'millionaire'
        where p2.market_id = pe.market_id and p2.outcome_side = pe.outcome_side and p2.kind in ('open', 'add') and p2.at between pe.at - interval '1 hour' and pe.at) as same_side
    from terminal.position_events pe left join terminal.watchlist w on w.wallet = pe.wallet left join terminal.trader_records tr on tr.wallet = pe.wallet
    where pe.last_at > ${new Date(now - ENGINE_WINDOW_MS)} order by pe.at`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({
    id: String(x.id), wallet: String(x.wallet), kind: x.kind as Move["kind"], marketId: String(x.market_id), side: x.outcome_side === "no" ? "no" as const : "yes" as const,
    outcome: String(x.outcome), title: String(x.market_title), eventTitle: String(x.event_title), category: String(x.category), url: x.url ? String(x.url) : null,
    amount: Number(x.amount), price: Number(x.price), at: new Date(String(x.at)).getTime(), lastAt: new Date(String(x.last_at)).getTime(),
    proven: x.wtier === "millionaire", settled: x.settled === null || x.settled === undefined ? null : Number(x.settled), sameSide: Number(x.same_side ?? 0),
    heldAfter: Number(x.held_after), shares: Number(x.shares),
  }));
}

interface ActiveRule { id: number; userId: string; name: string; spec: RuleSpec; quietStart: string | null; quietEnd: string | null; timeZone: string | null }

/** Active rules of paying members, with each member's quiet hours. */
export async function activeRules(db: Db): Promise<ActiveRule[]> {
  const rules = await db.select().from(autopilotRules).where(eq(autopilotRules.active, true));
  if (!rules.length) return [];
  const us = new Map((await db.select().from(users).where(inArray(users.id, [...new Set(rules.map(r => r.userId))]))).map(u => [u.id, u]));
  return rules.flatMap(r => {
    const u = us.get(r.userId);
    if (!u || !isPaid(effectivePlan(u))) return [];
    const s = { ...DEFAULT_SETTINGS, ...u.settings }, spec = cleanSpec(r.spec);
    return [{ id: r.id, userId: r.userId, name: r.name, spec, quietStart: spec.quiet.start ?? s.quietStart ?? null, quietEnd: spec.quiet.end ?? s.quietEnd ?? null, timeZone: s.timeZone ?? null }];
  });
}

/** Stake already committed by a rule today and this week (Monday on), on the member's own clock, sent and quiet matches. */
async function spent(db: Db, ruleId: number, now: number, tz: string | null): Promise<{ day: number; week: number }> {
  const { day: dayStart, week: weekStart } = localDayAndWeekStart(now, tz);
  const r = await db.execute(sql`select coalesce(sum(stake) filter (where matched_at >= ${new Date(dayStart)}), 0)::float as day, coalesce(sum(stake), 0)::float as week
    from terminal.autopilot_matches where rule_id = ${ruleId} and status in ('sent', 'quiet') and matched_at >= ${new Date(weekStart)}`);
  const x = r.rows[0] as { day: number; week: number } | undefined;
  return { day: Number(x?.day ?? 0), week: Number(x?.week ?? 0) };
}

export interface EngineResult { sent: number; quiet: number; skipped: number; capped: number; exits: number }

export async function runAutopilot(db: Db, now: number, deps: EngineDeps): Promise<EngineResult> {
  const out: EngineResult = { sent: 0, quiet: 0, skipped: 0, capped: 0, exits: 0 };
  const evs = await freshEvents(db, now);
  if (!evs.length) return out;
  const rules = await activeRules(db);
  const quotes = new Map<string, Promise<Quote | null>>();
  const quote = (id: string) => { let q = quotes.get(id); if (!q) { q = deps.quote(id).catch(() => null); quotes.set(id, q); } return q; };

  const buys = evs.filter(e => e.kind === "open" || e.kind === "add");
  if (buys.length && rules.length) {
    const twins = await approvedTwins(db, buys.map(e => e.marketId));
    const done = new Set((await db.select({ r: autopilotMatches.ruleId, e: autopilotMatches.eventId }).from(autopilotMatches)
      .where(inArray(autopilotMatches.eventId, buys.map(e => e.id)))).map(x => `${x.r}|${x.e}`));
    for (const e of buys) {
      const twin = twins.get(e.marketId);
      if (!twin) continue;
      for (const rule of rules) {
        if (done.has(`${rule.id}|${e.id}`) || mismatch(rule.spec, e)) continue;
        const q = await quote(twin.kalshiId);
        const ask = q ? (e.side === "yes" ? q.yesAsk : q.noAsk) : null;
        const base = { ruleId: rule.id, userId: rule.userId, eventId: e.id, wallet: e.wallet, marketId: e.marketId, kalshiId: twin.kalshiId, kalshiUrl: twin.kalshiUrl,
          side: e.side, outcome: e.outcome, title: e.title, category: e.category, amount: e.amount, theirPrice: e.price, ask, tradeAt: new Date(e.lastAt), matchedAt: new Date(now),
          latencyMs: Math.max(0, now - e.lastAt) };
        const late = tooLate(rule.spec, e.price, ask);
        if (late) {
          const r = await db.insert(autopilotMatches).values({ ...base, status: "skipped", reason: late }).onConflictDoNothing().returning({ id: autopilotMatches.id });
          out.skipped += r.length; continue;
        }
        const sp = await spent(db, rule.id, now, rule.timeZone);
        const t = ticketFor(rule.spec, ask!, stakeLeft(rule.spec, sp.day, sp.week));
        if (!t) {
          const r = await db.insert(autopilotMatches).values({ ...base, status: "capped", reason: "Skipped: today's or this week's limit for this rule is used up" }).onConflictDoNothing().returning({ id: autopilotMatches.id });
          out.capped += r.length; continue;
        }
        const quiet = inQuietHours(now, rule.quietStart, rule.quietEnd, rule.timeZone);
        const r = await db.insert(autopilotMatches).values({ ...base, status: quiet ? "quiet" : "sent", reason: quiet ? "Quiet hours: logged, not pushed" : null,
          limitPrice: t.limit, contracts: t.contracts, stake: t.cost, paperEntry: Math.min(0.99, Math.round((ask! + 0.01) * 100) / 100) })
          .onConflictDoNothing().returning({ id: autopilotMatches.id });
        if (!r.length) continue;
        if (quiet) { out.quiet++; continue; }
        out.sent++;
        await deps.push(rule.userId, matchPush({ id: r[0]!.id, ruleName: rule.name, outcome: e.outcome, side: e.side, contracts: t.contracts, limit: t.limit, theirPrice: e.price, amount: e.amount, latencyMs: base.latencyMs }, deps.appUrl)).catch(() => {});
      }
    }
  }

  const sells = evs.filter(e => e.kind === "trim" || e.kind === "exit");
  if (sells.length) {
    const quietOf = new Map(rules.map(r => [r.id, inQuietHours(now, r.quietStart, r.quietEnd, r.timeZone)]));
    for (const e of sells) {
      const open = await db.select().from(autopilotMatches).where(and(eq(autopilotMatches.wallet, e.wallet), eq(autopilotMatches.marketId, e.marketId), eq(autopilotMatches.side, e.side),
        inArray(autopilotMatches.status, ["sent", "quiet"]), isNull(autopilotMatches.exitAt), sql`${autopilotMatches.tradeAt} < ${new Date(e.at)}`));
      for (const m of open) {
        const q = await quote(m.kalshiId);
        const bid = q ? (m.side === "yes" ? q.yesBid : q.noBid) : null;
        if (e.kind === "exit") await db.update(autopilotMatches).set({ exitEventId: e.id, exitAt: new Date(e.at), exitPrice: bid }).where(and(eq(autopilotMatches.id, m.id), isNull(autopilotMatches.exitAt)));
        if (quietOf.get(m.ruleId) || !(await deps.claim(m.userId, `apx:${m.id}:${e.id}`))) continue;
        out.exits++;
        const sold = e.shares + e.heldAfter > 0 ? e.shares / (e.shares + e.heldAfter) : 1;
        await deps.push(m.userId, exitPush({ id: m.id, outcome: m.outcome, kind: e.kind as "trim" | "exit", sold, bid }, deps.appUrl)).catch(() => {});
      }
    }
  }
  return out;
}

/** Settles matches with the wallet's bet (a buy's event id is its bet id). */
export async function settleMatches(db: Db): Promise<number> {
  const r = await db.execute(sql`update terminal.autopilot_matches m set result = b.result, settled_at = coalesce(b.settled_at, now())
    from terminal.millionaire_bets b where b.id = m.event_id and m.result is null and b.result is not null`);
  return r.rowCount ?? 0;
}
