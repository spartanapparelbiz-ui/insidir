/* The /go funnel's data (server only). Every number comes from the database; nothing is made up.
 *   hook      the newest millionaire bet a visitor may see (60 minutes late), and the count of the last hour
 *   build     the building screen's lines, each its own query: watchlist size, millionaire bets today in their
 *             categories, markets priced on Kalshi
 *   aha       the 3 markets with the most $1M+ money today in their categories; only the first one's side is sent,
 *             the others' sides never leave the server; "+N more today"; and the stake line from a real record
 * The answers (./answers.ts) say which categories. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { boardRows, lastHourCount, VISITOR_DELAY_MS, type BoardRow } from "@/lib/millionaire/board";
import { TIER_MIN } from "@/lib/millionaire/tiers";
import { bestTracker } from "@/lib/nx/data";
import { artFor, sideFirst, type Art } from "@/lib/sky/art";
import { fullTeamNames } from "@/lib/sports/team-names";
import { catOf } from "@/lib/nx/data";
import { matchesAnswers, stakeDollars, type Answers } from "./answers";

const DAY = 86_400_000;

export interface Hook { bet: BoardRow | null; hour: number }
export async function hookData(db: Db, now: number): Promise<Hook> {
  const [bets, hour] = await Promise.all([boardRows(db, now, { delayMs: VISITOR_DELAY_MS, limit: 1, tier: "millionaire" }).catch(() => []), lastHourCount(db, now).catch(() => 0)]);
  return { bet: bets[0] ?? null, hour };
}

interface Bet { market: string; title: string; event: string | null; side: "yes" | "no"; outcome: string | null; amount: number; wallet: string; at: number; tab: string; league: string | null; category: string | null; yesNow: number | null }

async function todaysMillionaireBets(db: Db, now: number): Promise<Bet[]> {
  const r = await db.execute(sql`select b.market_id, b.market_title, b.event_title, b.outcome_side, b.outcome, b.amount::float as amount, b.wallet, b.at, b.tab, b.league, b.category, i.yes_price::float as yes_now
    from terminal.millionaire_bets b join terminal.millionaire_wallets w on w.wallet = b.wallet and w.pnl >= ${TIER_MIN.millionaire}
    left join terminal.market_info i on i.source = 'polymarket' and i.market_id = b.market_id
    where b.at > ${new Date(now - DAY)} and b.at <= ${new Date(now)} and b.result is null and coalesce(i.closed, false) = false
    order by b.at desc limit 2000`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({
    market: String(x.market_id), title: String(x.market_title), event: (x.event_title as string | null) ?? null, side: x.outcome_side === "no" ? "no" : "yes",
    outcome: (x.outcome as string | null) ?? null, amount: Number(x.amount), wallet: String(x.wallet), at: new Date(x.at as string).getTime(),
    tab: String(x.tab ?? "markets"), league: (x.league as string | null) ?? null, category: (x.category as string | null) ?? null, yesNow: x.yes_now === null || x.yes_now === undefined ? null : Number(x.yes_now),
  }));
}

/** The building screen's lines, one query each (the client asks for them one by one and ticks each in on return). */
export async function buildLine(db: Db, now: number, which: "wallets" | "bets" | "pricing", a: Answers): Promise<number> {
  if (which === "wallets") {
    const r = await db.execute(sql`select count(*)::int as n from terminal.millionaire_wallets where pnl >= ${TIER_MIN.pro}`);
    return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
  }
  if (which === "bets") return (await todaysMillionaireBets(db, now)).filter(b => matchesAnswers(b, a)).length;
  const r = await db.execute(sql`select count(distinct p.id)::int as n from terminal.pairs p where not p.blocked`);
  return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
}

export interface AhaCard {
  market: string; title: string; art: Art;
  /** $1M+ money on this market today (both sides). */
  dollars: number;
  /** The unlocked card only: the side with more, its dollars and wallets, and its price now. */
  side?: { label: string; dollars: number; wallets: number; priceNow: number | null };
}
export interface Aha { cards: AhaCard[]; more: number; stake: { amount: number; name: string; net: number; settled: number } | null }

/** The aha: `unlocked` cards show their side (1 for visitors, all 3 for members right after paying). */
export async function ahaData(db: Db, now: number, a: Answers, unlocked = 1): Promise<Aha> {
  const bets = (await todaysMillionaireBets(db, now)).filter(b => matchesAnswers(b, a));
  const byMarket = new Map<string, Bet[]>();
  for (const b of bets) byMarket.set(b.market, [...(byMarket.get(b.market) ?? []), b]);
  const ranked = [...byMarket.values()].map(list => ({ list, dollars: list.reduce((s, b) => s + b.amount, 0) })).sort((x, y) => y.dollars - x.dollars);
  const cards: AhaCard[] = ranked.slice(0, 3).map(({ list, dollars }, i) => {
    const b0 = list[0]!;
    const title = fullTeamNames(b0.title, b0.league);
    const cat = catOf({ tab: b0.tab, category: b0.category, text: `${b0.event ?? ""} ${title}` });
    const by = (s: "yes" | "no") => list.filter(b => b.side === s);
    const yes = by("yes"), no = by("no");
    const sum = (l: Bet[]) => l.reduce((t, b) => t + b.amount, 0);
    const top = sum(yes) >= sum(no) ? yes : no;
    const t0 = top[0]!;
    const label = fullTeamNames(t0.outcome ?? (t0.side === "yes" ? "Yes" : "No"), t0.league);
    // A locked card keeps the market's own order: side-first art would give the side away.
    const plain = artFor({ tab: b0.tab, league: b0.league, title, event: b0.event, cat });
    const card: AhaCard = { market: b0.market, title, art: i < unlocked ? sideFirst(plain, label, title) : plain, dollars };
    if (i < unlocked) card.side = { label, dollars: sum(top), wallets: new Set(top.map(b => b.wallet)).size, priceNow: t0.yesNow === null ? null : t0.side === "yes" ? t0.yesNow : 1 - t0.yesNow };
    return card;
  });
  // The stake line: until millionaire receipts exist, the best tracker's real followable record, at their stake.
  const best = await bestTracker(db, now).catch(() => null);
  const amount = stakeDollars(a.stake);
  const stake = best ? { amount, name: best.name, net: Math.round(amount * best.settled * best.returnPct), settled: best.settled } : null;
  return { cards, more: Math.max(0, ranked.length - cards.length), stake };
}
