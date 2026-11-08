/* The /go funnel's data, all live (lib/millionaires/queries.ts): the hook (the newest millionaire bet, its side removed
 * for anyone who hasn't paid), the building screen's real counts, the three aha markets from their categories (the
 * first whole; the other two with their money merged into one total, so which side it is on is never sent), their
 * leading rule from the Kalshi backtest (lib/autopilot/lead.ts; none positive over 100+ settled → none), and the wallets
 * to follow. Server only. */
import { sql } from "drizzle-orm";
import { isReady } from "@/lib/features";
import type { Db } from "@/lib/db";
import { CATEGORY_SLUGS, isCategory, type CategorySlug } from "@/lib/brand/categories";
import { betsToday, marketMoney, positions, pulse, recentBets, topWallets, VISITOR_DELAY_MS, type BoardBet, type MarketMoney, type Position, type Pulse, type TopWallet } from "@/lib/millionaires/queries";
import { leadRule, type Lead } from "@/lib/autopilot/lead";

const DAY = 86_400_000;

export { isSize, isWhere, SIZES, stakeFor, WHERE, type Size, type Where } from "./answers";

/** Their categories as the older onboarding's leagues (lib/read/member.ts BET_ON), so Tonight keeps working. */
export function betOnFor(cats: readonly string[]): string[] {
  const map: Partial<Record<CategorySlug, string[]>> = { football: ["nfl", "cfb"], basketball: ["nba"], hockey: ["nhl"], baseball: ["mlb"], soccer: ["soccer"], elections: ["elections"] };
  const out = new Set<string>();
  for (const c of cats) for (const b of map[c as CategorySlug] ?? ["other"]) out.add(b);
  return [...out];
}

export const parseCats = (raw: string | null | undefined): CategorySlug[] => [...new Set((raw ?? "").split(",").filter(isCategory))].slice(0, CATEGORY_SLUGS.length);

/** A market's money as a teaser: one total per tier (on "yes", the other side empty) and no positions. */
export function lockMoney(m: MarketMoney): MarketMoney {
  const merge = (t: MarketMoney["millionaire"]) => ({ yes: { dollars: t.yes.dollars + t.no.dollars, wallets: t.yes.wallets + t.no.wallets }, no: { dollars: 0, wallets: 0 } });
  return { ...m, millionaire: merge(m.millionaire), pro: merge(m.pro) };
}

export interface AhaCard { m: MarketMoney; positions: Position[]; locked: boolean }
export interface GoData {
  now: number;
  paid: boolean;
  pulse: Pulse;
  hook: BoardBet | null;
  build: { wallets: number; perCat: Record<string, number> };
  aha: { cards: AhaCard[]; more: number };
  lead: Lead | null;
  wallets: TopWallet[];
}

/** Has this visitor paid (a membership the billing webhook linked to their visitor id, before they signed in)? */
export async function paidByVisitor(db: Db, visitorId: string | null): Promise<boolean> {
  if (!visitorId) return false;
  const r = await db.execute(sql`select 1 from terminal.users where visitor_id = ${visitorId} and plan <> 'free' limit 1`);
  return r.rows.length > 0;
}

export async function goData(db: Db, cats: readonly CategorySlug[], now: number, paid: boolean): Promise<GoData> {
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(e => { console.error("go", e instanceof Error ? e.message : e); return d; });
  const [p, hooks, perCat, today, week, pr, wallets] = await Promise.all([
    safe(pulse(db, now), { count: 0, window: "hour" as const, wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0 }),
    // A visitor's hook is an hour late, like the board (it is prefetched on every page).
    safe(recentBets(db, { now, limit: 1, tier: "millionaire", member: paid, delayMs: paid ? 0 : VISITOR_DELAY_MS }), [] as BoardBet[]),
    safe(betsToday(db, cats, now), new Map<string, number>()),
    safe(marketMoney(db, { categories: cats.length ? cats : undefined, since: now - DAY, limit: 20, now }), [] as MarketMoney[]),
    safe(marketMoney(db, { categories: cats.length ? cats : undefined, since: now - 7 * DAY, limit: 3, now }), [] as MarketMoney[]),
    isReady("autopilot") ? safe(leadRule(db), null) : Promise.resolve(null), // backtest claims wait for legal review (lib/features.ts)
    safe(topWallets(db, cats, now, 3), [] as TopWallet[]),
  ]);
  const pool = today.length >= 3 ? today : [...today, ...week.filter(w => !today.some(t => t.marketId === w.marketId))];
  const three = pool.slice(0, 3);
  const cards: AhaCard[] = [];
  for (const [i, m] of three.entries()) {
    const open = paid || i === 0;
    // A visitor's free card shows each position's tier and short address only: the full address (whose Polygonscan page
    // lists the wallet's open trades) is for members.
    const pos = open ? await safe(positions(db, m.marketId), []) : [];
    cards.push({ m: open ? m : lockMoney(m), positions: paid ? pos : pos.map(x => ({ ...x, wallet: "" })), locked: !open });
  }
  return {
    now, paid, pulse: p, hook: hooks[0] ? (paid ? hooks[0] : { ...hooks[0], pnl: null }) : null, // a wallet's record is for members
    build: { wallets: p.wallets, perCat: Object.fromEntries(perCat) },
    aha: { cards, more: Math.max(0, today.length - 3) },
    lead: pr,
    wallets: paid ? wallets : [],
  };
}
