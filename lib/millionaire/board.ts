/* The Millionaires' board (/board, the landing preview, the funnel's hook and aha, pings): every millionaire bet
 * (terminal.millionaire_bets: a $5K+ bet by a watchlist wallet with $100K+ all-time profit), newest first. Each row:
 * the market, the side, the size, the price they paid, the price now and its change, the wallet's tier and all-time
 * pnl, and when. Members see it live; visitors VISITOR_DELAY_MS late, plus the live count of the last hour.
 * The wallet is never named: a row carries its tier, its all-time pnl and, for members, its short address. Server only. */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { artFor, sideFirst, type Art } from "@/lib/sky/art";
import { fullTeamNames } from "@/lib/sports/team-names";
import { catOf, type Cat } from "@/lib/nx/data";
import { shortWallet } from "@/lib/moves/records";
import { TIER_MIN, tierOf, type Tier } from "./tiers";

export const BOARD_MIN = 5_000;
export const VISITOR_DELAY_MS = 60 * 60_000;
const DAY = 86_400_000, HOUR = 3_600_000;

/** Election night (Nov 3–4, 2026, Eastern): the board's filter that pins Senate, House and the top races. */
export const ELECTION_NIGHT = { from: Date.parse("2026-11-03T05:00:00Z"), to: Date.parse("2026-11-05T05:00:00Z") };
export const electionNight = (now: number): boolean => now >= ELECTION_NIGHT.from - DAY && now < ELECTION_NIGHT.to;
const PINNED = /\b(senate|house)\b/i;

export interface BoardRow {
  id: string; marketId: string; title: string; side: string; cat: Cat | null;
  amount: number;
  /** What they paid for their side, 0..1. */
  priceThen: number;
  /** Their side's price now, 0..1; null when we have no current price. */
  priceNow: number | null;
  tier: Tier;
  /** The wallet's all-time profit on Polymarket (its public leaderboard row). */
  pnl: number;
  /** "0x4f…c2": shown to members only. Never who is behind it. */
  short: string;
  wallet: string;
  at: number;
  art: Art;
  /** An election-night pin (Senate, House). */
  pinned?: boolean;
}

export type BoardFilter = Cat | "election-night";

/** The board's rows: newest first, up to `limit`, none newer than `now - delayMs`. `min` and `tier` narrow it. */
export async function boardRows(db: Db, now: number, o: { delayMs?: number; limit?: number; min?: number; cats?: readonly Cat[] | null; filter?: BoardFilter | null; tier?: Tier; since?: number; wallet?: string } = {}): Promise<BoardRow[]> {
  const until = new Date(now - (o.delayMs ?? 0));
  const conds: SQL[] = [sql`b.amount >= ${o.min ?? BOARD_MIN}`, sql`b.at <= ${until}`, sql`b.at > ${new Date(o.since ?? now - 7 * DAY)}`,
    sql`w.pnl >= ${o.tier === "millionaire" ? TIER_MIN.millionaire : TIER_MIN.pro}`];
  if (o.wallet) conds.push(sql`b.wallet = ${o.wallet}`);
  const election = o.filter === "election-night";
  const r = await db.execute(sql`select b.id, b.wallet, b.market_id, b.market_title, b.event_title, b.outcome, b.outcome_side, b.amount::float as amount, b.price::float as price,
      b.at, b.tab, b.league, b.category, w.pnl::float as pnl, i.yes_price::float as yes_now
    from terminal.millionaire_bets b
    join terminal.millionaire_wallets w on w.wallet = b.wallet
    left join terminal.market_info i on i.source = 'polymarket' and i.market_id = b.market_id
    where ${sql.join(conds, sql` and `)}
    order by b.at desc limit ${Math.min(400, (o.limit ?? 50) * (o.cats?.length || o.filter ? 6 : 1))}`);
  const out: BoardRow[] = [];
  for (const x of r.rows as Array<Record<string, unknown>>) {
    const league = (x.league as string | null) ?? null, tab = String(x.tab ?? "markets");
    const title = fullTeamNames(String(x.market_title), league);
    const side = fullTeamNames(String(x.outcome ?? (x.outcome_side === "yes" ? "Yes" : "No")), league);
    const cat = catOf({ tab, category: (x.category as string | null) ?? null, text: `${x.event_title ?? ""} ${title}` });
    if (o.cats?.length && (!cat || !o.cats.includes(cat))) continue;
    if (o.filter && o.filter !== "election-night" && cat !== o.filter) continue;
    if (election && cat !== "elections") continue;
    const tier = tierOf(Number(x.pnl));
    if (!tier) continue;
    const yesNow = x.yes_now === null || x.yes_now === undefined ? null : Number(x.yes_now);
    out.push({
      id: String(x.id), marketId: String(x.market_id), title, side, cat, amount: Number(x.amount), priceThen: Number(x.price),
      priceNow: yesNow === null ? null : x.outcome_side === "yes" ? yesNow : 1 - yesNow, tier, pnl: Number(x.pnl),
      wallet: String(x.wallet), short: shortWallet(String(x.wallet)), at: new Date(x.at as string).getTime(),
      art: sideFirst(artFor({ tab, league, title, event: (x.event_title as string | null) ?? null, cat, yesLabel: (x.outcome as string | null) ?? undefined }), side, title),
      ...(election && PINNED.test(`${x.event_title ?? ""} ${title}`) ? { pinned: true } : {}),
    });
  }
  // Election night: Senate and House races first, then the rest, each newest first.
  const rows = election ? [...out.filter(b => b.pinned), ...out.filter(b => !b.pinned)] : out;
  return rows.slice(0, o.limit ?? 50);
}

/** Millionaire bets in the last hour (live, for everyone: "14 millionaire bets in the last hour"). */
export async function lastHourCount(db: Db, now: number, cats?: readonly Cat[] | null): Promise<number> {
  if (cats?.length) return (await boardRows(db, now, { since: now - HOUR, limit: 400, cats })).length;
  const r = await db.execute(sql`select count(*)::int as n from terminal.millionaire_bets b join terminal.millionaire_wallets w on w.wallet = b.wallet and w.pnl >= ${TIER_MIN.pro}
    where b.amount >= ${BOARD_MIN} and b.at > ${new Date(now - HOUR)} and b.at <= ${new Date(now)}`);
  return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
}

export interface BoardStats {
  /** Every large position Insidir has tracked on Polymarket and Kalshi. */
  bigBets: number;
  /** Wallets with $1M+ all-time profit on the watchlist. */
  millionaires: number;
  /** Dollars $1M+ wallets bet in the last 24 hours. */
  movedToday: number;
}

export async function boardStats(db: Db, now: number): Promise<BoardStats> {
  const r = await db.execute(sql`select
      (select count(*)::int from terminal.moves where source in ('polymarket', 'kalshi') and hidden_at is null) as big_bets,
      (select count(*)::int from terminal.millionaire_wallets where pnl >= ${TIER_MIN.millionaire}) as millionaires,
      (select coalesce(sum(b.amount), 0)::float from terminal.millionaire_bets b join terminal.millionaire_wallets w on w.wallet = b.wallet and w.pnl >= ${TIER_MIN.millionaire}
        where b.at > ${new Date(now - DAY)} and b.at <= ${new Date(now)}) as moved`);
  const x = r.rows[0] as { big_bets: number; millionaires: number; moved: number } | undefined;
  return { bigBets: Number(x?.big_bets ?? 0), millionaires: Number(x?.millionaires ?? 0), movedToday: Number(x?.moved ?? 0) };
}

const k = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);
const c = (p: number) => `${Math.round(p * 100)}¢`;

/** "$120K on Rams at 69¢ (now 70¢)". */
export function boardLine(b: Pick<BoardRow, "amount" | "side" | "priceThen" | "priceNow">): string {
  return `${k(b.amount)} on ${b.side} at ${c(b.priceThen)}${b.priceNow !== null ? ` (now ${c(b.priceNow)})` : ""}`;
}

/** "+$3.1M": a wallet's all-time profit, the way every row says it. */
export const pnlText = (pnl: number): string => `${pnl >= 0 ? "+" : "−"}${k(Math.abs(pnl))}`;

/** "A +$2.4M wallet just bet $85K on Rams at 69¢". */
export function hookLine(b: Pick<BoardRow, "amount" | "side" | "priceThen" | "pnl">, verb = "just bet"): string {
  return `A ${pnlText(b.pnl)} wallet ${verb} ${k(b.amount)} on ${b.side} at ${c(b.priceThen)}`;
}
