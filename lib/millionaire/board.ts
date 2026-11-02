/* The Millionaires' board (/board, and its preview on the landing page): every bet of BOARD_MIN+ from a Polymarket
 * wallet with $1M+ all-time profit (lib/millionaire/tiers.ts), newest first. Each row: the market, the side, the size,
 * the price they paid, the price now, the wallet's tier, and when. Members see it live; visitors VISITOR_DELAY_MS late.
 * The wallet is never named: a row carries its tier only. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { notComboSql } from "@/lib/moves/combos";
import { artFor, sideFirst, type Art } from "@/lib/sky/art";
import { fullTeamNames } from "@/lib/sports/team-names";
import { catOf, type Cat } from "@/lib/nx/data";
import { TIER_MIN, tierOf, type Tier } from "./tiers";

export const BOARD_MIN = 10_000;
export const VISITOR_DELAY_MS = 60 * 60_000;
const DAY = 86_400_000;

export interface BoardRow {
  id: string; marketId: string; title: string; side: string; cat: Cat | null;
  amount: number;
  /** What they paid for their side, 0..1. */
  priceThen: number;
  /** Their side's price now, 0..1; null when we have no current price. */
  priceNow: number | null;
  tier: Tier;
  at: number;
  art: Art;
}

/** The board's rows: newest first, up to `limit`, none newer than `now - delayMs`. */
export async function boardRows(db: Db, now: number, o: { delayMs?: number; limit?: number; min?: number; cats?: readonly Cat[] | null } = {}): Promise<BoardRow[]> {
  const until = new Date(now - (o.delayMs ?? 0));
  const r = await db.execute(sql`select terminal.moves.id, terminal.moves.market_id, terminal.moves.market_title, terminal.moves.event_title, terminal.moves.outcome, terminal.moves.outcome_side, terminal.moves.amount::float as amount, terminal.moves.avg_price::float as price,
      terminal.moves.at, terminal.moves.tab, terminal.moves.league, terminal.moves.category, wp.pnl::float as pnl, i.yes_price::float as yes_now
    from terminal.moves
    join terminal.wallet_pnl wp on wp.wallet = terminal.moves.wallet and wp.pnl >= ${TIER_MIN.millionaire}
    left join terminal.market_info i on i.source = terminal.moves.source and i.market_id = terminal.moves.market_id
    where terminal.moves.source = 'polymarket' and terminal.moves.hidden_at is null and ${notComboSql} and terminal.moves.amount >= ${o.min ?? BOARD_MIN}
      and terminal.moves.at <= ${until} and terminal.moves.at > ${new Date(now - 7 * DAY)}
    order by terminal.moves.at desc limit ${Math.min(200, (o.limit ?? 50) * (o.cats?.length ? 4 : 1))}`);
  const out: BoardRow[] = [];
  for (const x of r.rows as Array<Record<string, unknown>>) {
    const league = (x.league as string | null) ?? null, tab = String(x.tab);
    const title = fullTeamNames(String(x.market_title), league);
    const side = fullTeamNames(String(x.outcome ?? (x.outcome_side === "yes" ? "Yes" : "No")), league);
    const cat = catOf({ tab, category: (x.category as string | null) ?? null, text: `${x.event_title ?? ""} ${title}` });
    if (o.cats?.length && (!cat || !o.cats.includes(cat))) continue;
    const yesNow = x.yes_now === null || x.yes_now === undefined ? null : Number(x.yes_now);
    const tier = tierOf(Number(x.pnl));
    if (!tier) continue;
    out.push({
      id: String(x.id), marketId: String(x.market_id), title, side, cat, amount: Number(x.amount), priceThen: Number(x.price),
      priceNow: yesNow === null ? null : x.outcome_side === "yes" ? yesNow : 1 - yesNow, tier, at: new Date(x.at as string).getTime(),
      art: sideFirst(artFor({ tab, league, title, event: (x.event_title as string | null) ?? null, cat, yesLabel: (x.outcome as string | null) ?? undefined }), side, title),
    });
    if (out.length >= (o.limit ?? 50)) break;
  }
  return out;
}

export interface BoardStats {
  /** Every large position Insidir has tracked on Polymarket and Kalshi. */
  bigBets: number;
  /** Wallets with $1M+ all-time profit on Polymarket's public leaderboard that Insidir has a record for. */
  millionaires: number;
  /** Dollars those wallets put into tracked bets in the last 24 hours. */
  movedToday: number;
}

export async function boardStats(db: Db, now: number): Promise<BoardStats> {
  const r = await db.execute(sql`select
      (select count(*)::int from terminal.moves where source in ('polymarket', 'kalshi') and hidden_at is null) as big_bets,
      (select count(*)::int from terminal.wallet_pnl where pnl >= ${TIER_MIN.millionaire}) as millionaires,
      (select coalesce(sum(m.amount), 0)::float from terminal.moves m join terminal.wallet_pnl wp on wp.wallet = m.wallet and wp.pnl >= ${TIER_MIN.millionaire}
        where m.source = 'polymarket' and m.hidden_at is null and m.at > ${new Date(now - DAY)} and m.at <= ${new Date(now)}) as moved`);
  const x = r.rows[0] as { big_bets: number; millionaires: number; moved: number } | undefined;
  return { bigBets: Number(x?.big_bets ?? 0), millionaires: Number(x?.millionaires ?? 0), movedToday: Number(x?.moved ?? 0) };
}

/** "$120K on Rams at 69¢ (now 70¢)". */
export function boardLine(b: Pick<BoardRow, "amount" | "side" | "priceThen" | "priceNow">): string {
  const k = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);
  const c = (p: number) => `${Math.round(p * 100)}¢`;
  return `${k(b.amount)} on ${b.side} at ${c(b.priceThen)}${b.priceNow !== null ? ` (now ${c(b.priceNow)})` : ""}`;
}
