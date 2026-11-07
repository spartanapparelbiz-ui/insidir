/* The landing's live value blocks, all from our own tables (server only). Every block comes back empty rather than
 * invented: the page says so or steps the block aside.
 *   The Pulse: millionaire money today; the biggest millionaire bet today (side included: it's free); the hottest market;
 *     where millionaire money disagrees with the price (top one free, the next four locked: their side and numbers are
 *     never sent to visitors); the unusual bet of the day (a new wallet betting big on a long shot).
 *   Election Day board (Nov 3–4 ET only): the races with the most watchlist money; top 3 whole, the rest locked.
 *   Wallet spotlight: one $1M+ wallet's last 10 closed positions, what each made or lost (by tier and a short address only).
 *   Your stake: the best real followable record (30+ settled), scaled to the reader's stake.
 *   Price gaps: the 3 biggest live price differences between a matched Kalshi and Polymarket market. */
import { humanLine } from "@/lib/markets/title";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { category as categoryInfo, type CategorySlug } from "@/lib/brand/categories";
import { MIN_SETTLED } from "@/lib/follow/math";
import type { VenueClient } from "@/lib/exchanges";
import { memo, memoStale } from "@/lib/memo";
import type { Book, VMarket } from "@/lib/types";
import { marketMoney, midnightET, recentBets, type BoardBet, type MarketMoney } from "@/lib/millionaires/queries";
import { shortWallet } from "@/lib/millionaires/watchlist";

const DAY = 86_400_000;
export const mil = (m: MarketMoney): number => m.millionaire.yes.dollars + m.millionaire.no.dollars;

/* ---------- Where millionaires disagree with the price ---------- */

export interface Disagreement { marketId: string; title: string; category: CategorySlug; side: "yes" | "no"; outcome: string; share: number; price: number; gap: number; dollars: number; wallets: number }
/** Locked rows carry only what the market is about, never its side or numbers. */
export interface LockedRow { category: CategorySlug; categoryName: string }

/** Markets where at least 70% of the millionaire money (≥ $20K, 2+ wallets) is on a side the price gives 50¢ or less:
 *  the money says one thing, the price another. Biggest gap first. */
export function disagreements(list: readonly MarketMoney[]): Disagreement[] {
  const out: Disagreement[] = [];
  for (const m of list) {
    const t = m.millionaire, total = t.yes.dollars + t.no.dollars, wallets = t.yes.wallets + t.no.wallets;
    if (total < 20_000 || wallets < 2 || m.priceNow === null) continue;
    const side = t.yes.dollars >= t.no.dollars ? "yes" : "no";
    const share = t[side].dollars / total, price = side === "yes" ? m.priceNow : 1 - m.priceNow;
    if (share < 0.7 || price > 0.5 || price <= 0.01) continue;
    out.push({ marketId: m.marketId, title: m.title, category: m.category, side, outcome: side === "yes" ? m.yesLabel : m.noLabel, share, price, gap: share - price, dollars: t[side].dollars, wallets: t[side].wallets });
  }
  return out.sort((a, b) => b.gap - a.gap);
}

/* ---------- The unusual bet of the day ---------- */

export interface Unusual { title: string; outcome: string; amount: number; price: number; at: number; category: string | null; marketId: string }

/** Today's biggest bet (since midnight ET, else the last 24 h) by a wallet new to Polymarket on a long shot (25¢ or
 *  less). No wallet, name or address is sent. */
async function unusualBet(db: Db, now: number): Promise<Unusual | null> {
  const pick = async (since: number) => {
    const r = await db.execute(sql`select market_id, market_title, outcome, amount, avg_price, at, category from terminal.moves
      where source = 'polymarket' and new_wallet and hidden_at is null and avg_price > 0.01 and avg_price <= 0.25 and amount >= 5000 and at > ${new Date(since)}
      order by amount desc limit 1`);
    const x = r.rows[0] as Record<string, unknown> | undefined;
    return x ? { marketId: String(x.market_id), title: humanLine({ title: String(x.market_title) }), outcome: String(x.outcome), amount: Number(x.amount), price: Number(x.avg_price), at: new Date(x.at as string).getTime(), category: (x.category as string | null) ?? null } : null;
  };
  return (await pick(midnightET(now))) ?? pick(now - DAY);
}

/* ---------- The Pulse ---------- */

export interface Pulse2 {
  /** Millionaire dollars bet since midnight ET (0: none yet). */
  today: number;
  biggest: BoardBet | null;
  hottest: MarketMoney | null;
  disagree: { free: Disagreement | null; locked: LockedRow[] };
  unusual: Unusual | null;
}

export async function pulseData(db: Db, now: number, today: number, pool: readonly MarketMoney[]): Promise<Pulse2> {
  const midnight = midnightET(now);
  const [bets, unusual, wide] = await Promise.all([
    recentBets(db, { now, since: midnight, limit: 200, tier: "millionaire", withSide: true }).catch(() => [] as BoardBet[]),
    unusualBet(db, now).catch(() => null),
    marketMoney(db, { since: now - 7 * DAY, limit: 60, now }).catch(() => [] as MarketMoney[]),
  ]);
  const d = disagreements(wide);
  return {
    today,
    biggest: [...bets].sort((a, b) => b.amount - a.amount)[0] ?? null,
    hottest: [...pool].filter(m => mil(m) > 0).sort((a, b) => mil(b) - mil(a))[0] ?? null,
    disagree: { free: d[0] ?? null, locked: d.slice(1, 5).map(x => ({ category: x.category, categoryName: categoryInfo(x.category).name })) },
    unusual,
  };
}

/* ---------- Election Day board ---------- */

/** Election Day: Nov 3, 2026 in ET (the board shows only then; the election is over after it, and /election keeps the
 *  results). ELECTION_BOARD=off turns it off; =on turns it on only before Nov 4 (an election-eve switch), so a leftover
 *  setting can't bring it back. */
export function electionDay(now: number, env: string | undefined = process.env.ELECTION_BOARD): boolean {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  if (env === "off" || d >= "2026-11-04") return false;
  if (env === "on") return true;
  return d === "2026-11-03";
}

export interface Race { marketId: string; title: string; yesLabel: string; noLabel: string; millionaire: MarketMoney["millionaire"]; pro: MarketMoney["pro"]; priceNow: number | null; total: number }
export interface ElectionBoard { at: number; free: Race[]; locked: Array<{ title: string; total: number }> }

/** A major race: who controls the Senate or the House, a Senate or governor race (one seat). Combination bets ("win
 *  Iowa and Kansas, and lose Alaska…") and everything else in politics are left out. */
export function majorRace(title: string): "control" | "race" | null {
  const t = title.trim();
  if ((t.match(/,/g) ?? []).length >= 2 || /\band (?:lose|win)\b/i.test(t)) return null;
  if (/\b(control|balance of power)\b/i.test(t) && /\b(senate|house|congress)\b/i.test(t)) return "control";
  if (/\b(senate|governor|gubernatorial)\b/i.test(t) && /\b(race|seat|election|win)\b/i.test(t)) return "race";
  return null;
}

/** The major races with watchlist money this week: control of the Senate and House first, then the Senate and governor
 *  races by money. Visitors get the top 3 whole and the rest by title and total (their split and price are members'). */
/** `settled`: settled races too, from the last 90 days (race pages and /election's results keep them). */
export async function electionBoard(db: Db, now: number, member = false, settled = false): Promise<ElectionBoard> {
  const list = await marketMoney(db, { categories: ["elections", "politics"], since: now - (settled ? 90 : 7) * DAY, limit: settled ? 400 : 80, now, settled });
  const all = (m: MarketMoney) => mil(m) + m.pro.yes.dollars + m.pro.no.dollars;
  const races = list.map(m => ({ m, kind: majorRace(m.title) })).filter((x): x is { m: MarketMoney; kind: "control" | "race" } => x.kind !== null && all(x.m) > 0)
    .sort((a, b) => (a.kind === b.kind ? all(b.m) - all(a.m) : a.kind === "control" ? -1 : 1)).slice(0, settled ? 80 : 16)
    .map(({ m }) => ({ marketId: m.marketId, title: m.title, yesLabel: m.yesLabel, noLabel: m.noLabel, millionaire: m.millionaire, pro: m.pro, priceNow: m.priceNow, total: all(m) }));
  const open = member ? races.length : 3;
  return { at: now, free: races.slice(0, open), locked: races.slice(open).map(r => ({ title: r.title, total: r.total })) };
}

/* ---------- Wallet spotlight ---------- */

export interface SpotlightRow { title: string; outcome: string | null; price: number | null; moneyIn: number; pnl: number; won: boolean; at: number | null }
export interface Spotlight { short: string; tier: "millionaire"; pnl: number; rows: SpotlightRow[]; won: number }

/** One $1M+ watchlist wallet with 10+ resolved positions, the one that resolved something most recently: its last 10,
 *  wins and losses. By tier, all-time profit and a short address only. */
export function walletSpotlight(db: Db): Promise<Spotlight | null> {
  return memo("brand:spotlight", 10 * 60_000, async () => {
    const r = await db.execute(sql`select w.wallet, w.pnl::float as pnl from terminal.watchlist w
      join terminal.trader_positions p on p.wallet = w.wallet
      where w.tier = 'millionaire' and p.resolved_at is not null and p.money_in >= 100
      group by w.wallet, w.pnl having count(*) >= 10 order by max(p.resolved_at) desc limit 1`);
    const w = r.rows[0] as { wallet: string; pnl: number } | undefined;
    if (!w) return null;
    const rows = (await db.execute(sql`select title, outcome, avg_price, money_in, pnl, resolved_at from terminal.trader_positions
      where wallet = ${w.wallet} and resolved_at is not null and money_in >= 100 order by resolved_at desc limit 10`)).rows as Array<Record<string, unknown>>;
    const list = rows.map(x => ({ title: humanLine({ title: String(x.title) }), outcome: (x.outcome as string | null) ?? null, price: x.avg_price === null ? null : Number(x.avg_price),
      moneyIn: Number(x.money_in), pnl: Number(x.pnl), won: Number(x.pnl) > 0, at: x.resolved_at ? new Date(x.resolved_at as string).getTime() : null }));
    return { short: shortWallet(w.wallet), tier: "millionaire" as const, pnl: Number(w.pnl), rows: list, won: list.filter(x => x.won).length };
  });
}

/* ---------- Your stake ---------- */

export interface StakeRecord { n: number; won: number; lost: number; staked: number; net: number; roi: number; stake: number }

export { MIN_SETTLED };

/* ---------- Price gaps ---------- */

export interface PriceGap { title: string; outcome: string; kalshi: number; polymarket: number; gap: number }
type Live = Pick<VenueClient, "getMarketsById" | "getBooks">;
const bestAsk = (levels: ReadonlyArray<{ price: number }> | undefined): number | null => (levels?.length ? Math.min(...levels.map(l => l.price)) : null);

/** The 3 biggest live differences in price for the same outcome on a matched Kalshi / Polymarket pair. Candidates are
 *  the matcher's unblocked pairs, green or yellow with 0.9+ confidence and no rules difference found, closing more than
 *  2 hours out; the 40 widest by stored price are re-priced from
 *  both venues (once a minute at most), and a gap counts when both prices are 3–97¢ and it is 2–15¢ (wider usually
 *  means the pair isn't the same bet). Each price is the best ask: what buying that outcome costs now. */
export function priceGaps(db: Db, clients: { kalshi: Live; polymarket: Live }, now: number): Promise<PriceGap[]> {
  return memoStale("brand:price-gaps", 60_000, async () => {
    // Approved twins only (lib/twins): the same event, outcome, line, source and close date, YES for YES.
    const r = await db.execute(sql`select json_build_object('inverted', false) as pair, 'polymarket' as av, a.data as a, 'kalshi' as bv, b.data as b from terminal.market_twins t
      join terminal.markets a on a.venue = 'polymarket' and a.id = t.polymarket_id
      join terminal.markets b on b.venue = 'kalshi' and b.id = t.kalshi_id
      where t.status = 'approved' and (a.data->>'active')::boolean is not false and (b.data->>'active')::boolean is not false
        and a.data->>'yesPrice' is not null and b.data->>'yesPrice' is not null
        and coalesce((a.data->>'closeTime')::bigint, 0) > ${now + 2 * 3_600_000} and coalesce((b.data->>'closeTime')::bigint, 0) > ${now + 2 * 3_600_000}
      limit 5000`);
    type Row = { pair: { inverted: boolean }; av: string; a: Record<string, unknown>; bv: string; b: Record<string, unknown> };
    const cands = (r.rows as Row[]).filter(x => [x.av, x.bv].includes("kalshi") && [x.av, x.bv].includes("polymarket")).map(x => {
      const k = x.av === "kalshi" ? x.a : x.b, pm = x.av === "kalshi" ? x.b : x.a;
      const kp = Number(k.yesPrice), pp = x.pair.inverted ? 1 - Number(pm.yesPrice) : Number(pm.yesPrice);
      return { k, pm, inverted: x.pair.inverted, stored: Math.abs(kp - pp) };
    }).sort((x, y) => y.stored - x.stored).slice(0, 40);
    if (!cands.length) return [];
    const [kl, pl] = await Promise.all([
      clients.kalshi.getMarketsById(cands.map(c => String(c.k.id))).catch(() => new Map<string, VMarket>()),
      clients.polymarket.getMarketsById(cands.map(c => String(c.pm.id))).catch(() => new Map<string, VMarket>()),
    ]);
    // The price to buy the outcome now on each venue: the best ask (a last trade can be hours old on a thin market).
    const km = cands.map(c => kl.get(String(c.k.id))).filter((m): m is VMarket => Boolean(m && m.active !== false));
    const pmm = cands.map(c => pl.get(String(c.pm.id))).filter((m): m is VMarket => Boolean(m && m.active !== false));
    const [kb, pb] = await Promise.all([
      clients.kalshi.getBooks(km).catch(() => new Map<string, Book>()),
      clients.polymarket.getBooks(pmm).catch(() => new Map<string, Book>()),
    ]);
    const out: PriceGap[] = [];
    for (const c of cands) {
      const k = kl.get(String(c.k.id)), pm = pl.get(String(c.pm.id));
      if (!k || !pm) continue;
      const kbook = kb.get(k.id) ?? kb.get(`kalshi:${k.id}`), pbook = pb.get(pm.id) ?? pb.get(`polymarket:${pm.id}`);
      const ka = bestAsk(kbook?.yesAsks), pa = bestAsk(c.inverted ? pbook?.noAsks : pbook?.yesAsks);
      if (ka === null || pa === null) continue;
      const kp = Math.round(ka * 100) / 100, pp = Math.round(pa * 100) / 100;
      if (!(kp >= 0.03 && kp <= 0.97 && pp >= 0.03 && pp <= 0.97)) continue;
      const gap = Math.round(Math.abs(kp - pp) * 100) / 100;
      if (gap < 0.02 || gap > 0.15) continue;
      // The outcome by Polymarket's name for it (Kalshi's labels are often clipped: "Los Angeles L").
      const name = c.inverted ? pm.noLabel : pm.yesLabel;
      out.push({ title: pm.title || k.title, outcome: name && !/^(yes|no)$/i.test(name) ? name : `${c.inverted ? "No" : "Yes"}`, kalshi: kp, polymarket: pp, gap });
    }
    return out.sort((a, b) => b.gap - a.gap).slice(0, 3);
  });
}
