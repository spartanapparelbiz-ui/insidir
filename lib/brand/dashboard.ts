/* The member home's data, all live: their categories (the /go quiz), the live feed in them, the markets they checked
 * (with each one's millionaire money now), the wallets they follow and their latest bets, and their week: of their
 * checked markets that settled in the last 7 days, how often the side with more millionaire money won. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { isCategory, type CategorySlug } from "@/lib/brand/categories";
import { marketMoney, pulse, recentBets, type BoardBet, type MarketMoney, type Pulse } from "@/lib/millionaires/queries";
import { followList } from "@/lib/moves/store";
import { yourMarkets, type YourMarket } from "@/lib/read/member";

const DAY = 86_400_000;

export interface WeekLine { question: string; heavier: string; won: string; right: boolean }
export interface Week { right: number; of: number; lines: WeekLine[] }
export interface Dashboard {
  now: number;
  cats: CategorySlug[];
  pulse: Pulse;
  feed: BoardBet[];
  markets: Array<YourMarket & { money: MarketMoney | null }>;
  following: { wallets: number; bets: BoardBet[] };
  week: Week;
}

/** Their checked markets that settled this week: did the side with more millionaire money win? */
export async function weekFor(db: Db, userId: string, now: number): Promise<Week> {
  const r = await db.execute(sql`
    with mine as (select distinct data->'polymarket'->>'id' as pid, max(data->>'question') as question from terminal.reads
      where user_id = ${userId} and data->'polymarket'->>'id' is not null group by 1)
    select m.question, b.outcome_side, max(b.outcome) as outcome, sum(b.amount)::float as dollars, max(b.result) filter (where b.outcome_side = 'yes') as yes_result,
      max(b.result) filter (where b.outcome_side = 'no') as no_result
    from mine m join terminal.millionaire_bets b on b.market_id = m.pid
    where b.tier = 'millionaire' and b.result in ('won', 'lost') and b.settled_at > ${new Date(now - 7 * DAY)}
    group by m.question, b.outcome_side`);
  const by = new Map<string, Array<Record<string, unknown>>>();
  for (const x of r.rows as Array<Record<string, unknown>>) by.set(String(x.question), [...(by.get(String(x.question)) ?? []), x]);
  const lines: WeekLine[] = [];
  for (const [question, sides] of by) {
    const heavy = sides.sort((a, b) => Number(b.dollars) - Number(a.dollars))[0]!;
    const won = sides.find(s => (s.outcome_side === "yes" ? s.yes_result : s.no_result) === "won");
    const right = (heavy.outcome_side === "yes" ? heavy.yes_result : heavy.no_result) === "won";
    lines.push({ question, heavier: String(heavy.outcome), won: won ? String(won.outcome) : right ? String(heavy.outcome) : "the other side", right });
  }
  return { right: lines.filter(l => l.right).length, of: lines.length, lines };
}

export async function dashboardData(db: Db, userId: string, settings: { go?: { categories: string[] } | null }, now: number): Promise<Dashboard> {
  const cats = (settings.go?.categories ?? []).filter(isCategory);
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(e => { console.error("dashboard", e instanceof Error ? e.message : e); return d; });
  const [p, feed, mine, follows, week] = await Promise.all([
    safe(pulse(db, now), { count: 0, window: "hour" as const, wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0 }),
    safe(recentBets(db, { now, limit: 8, member: true, categories: cats.length ? cats : undefined }), [] as BoardBet[]),
    safe(yourMarkets(db, userId, now, 8), [] as YourMarket[]),
    safe(followList(db, userId), []),
    safe(weekFor(db, userId, now), { right: 0, of: 0, lines: [] }),
  ]);
  const wallets = follows.filter(f => f.kind === "trader").map(f => f.target.toLowerCase());
  const pids = mine.map(x => x.latest.data.polymarket?.id).filter((x): x is string => Boolean(x));
  const [money, fbets] = await Promise.all([
    safe(marketMoney(db, { marketIds: pids, now }), [] as MarketMoney[]),
    wallets.length ? safe(recentBets(db, { now, limit: 6, member: true, wallets }), [] as BoardBet[]) : Promise.resolve([] as BoardBet[]),
  ]);
  const byId = new Map(money.map(x => [x.marketId, x]));
  return {
    now, cats, pulse: p, feed, week,
    markets: mine.map(x => ({ ...x, money: byId.get(x.latest.data.polymarket?.id ?? "") ?? null })),
    following: { wallets: wallets.length, bets: fbets },
  };
}
