/* One market's page data (server only), Kalshi first:
 *   twin      its approved Kalshi twin (lib/twins: same event, outcome, line, source and close; YES for YES), with
 *             Kalshi's price now and link. No approved twin: null, and the page says so with no Kalshi link.
 *   money     the watchlist's money per side (millionaire and Pro), from every bet on it
 *   bets      every bet, newest first. Visitors: 60 minutes late and without the side, like the board.
 *   chart     Polymarket's price history, with each millionaire entry on it (members: the dots give the side away)
 *   result    the side that won, once it settles
 *   related   the other markets in the same event, else the busiest in its category */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { isCategory, type CategorySlug } from "@/lib/brand/categories";
import { yesPrices } from "@/lib/copies/store";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { memo } from "@/lib/memo";
import { humanLine } from "@/lib/markets/title";
import { infoFor, priceHistory } from "@/lib/markets/info";
import { outcomeNames, recentBets, VISITOR_DELAY_MS, type BoardBet } from "@/lib/millionaires/queries";
import { approvedTwins } from "@/lib/twins/store";
import { marketPath } from "./slug";

export interface Side { dollars: number; wallets: number }
export interface MarketTwin { kalshiId: string; title: string; url: string; yes: number | null }
export interface MarketView {
  id: string; slug: string; title: string; event: string; category: CategorySlug; yesLabel: string; noLabel: string; url: string | null;
  priceNow: number | null; closed: boolean; result: "yes" | "no" | "void" | null;
  twin: MarketTwin | null;
  money: { millionaire: Record<"yes" | "no", Side>; pro: Record<"yes" | "no", Side>; total: number };
  bets: BoardBet[]; betCount: number;
  chart: Array<{ t: number; v: number }>; dots: Array<{ t: number; v: number; r: number; title: string }>;
  related: Array<{ id: string; title: string; href: string; total: number }>;
}

const empty = (): Record<"yes" | "no", Side> => ({ yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 } });
let clients: { polymarket: PolymarketClient; kalshi: KalshiClient } | null = null;

/** The market's Kalshi twin, approved, with Kalshi's YES price now (null when Kalshi hasn't been read). */
export async function twinOf(db: Db, ids: readonly string[]): Promise<Map<string, MarketTwin>> {
  const twins = await approvedTwins(db, ids);
  const px = await yesPrices(db, "kalshi", [...twins.values()].map(t => t.kalshiId)).catch(() => new Map<string, number>());
  return new Map([...twins].map(([id, t]) => [id, { kalshiId: t.kalshiId, title: t.kalshiTitle, url: t.kalshiUrl, yes: px.get(t.kalshiId) ?? null }]));
}

/** `fallbackTitle`: a market the matcher or an old position knows but no watchlist wallet bet on yet (its page still
 *  opens, empty of bets). */
export async function marketView(db: Db, id: string, now: number, member: boolean, fallbackTitle?: string): Promise<MarketView | null> {
  const head = await db.execute(sql`select max(market_title) as title, max(event_title) as event, max(category) as category, max(url) as url,
      coalesce(max(yes_label), max(case when outcome_side = 'yes' then outcome end)) as yes_label,
      coalesce(max(no_label), max(case when outcome_side = 'no' then outcome end)) as no_label,
      max(result) filter (where result is not null) as result, max(outcome_side) filter (where result = 'won') as won_side,
      max(outcome_side) filter (where result = 'lost') as lost_side, bool_or(result = 'void') as void, count(*)::int as n
    from terminal.millionaire_bets where market_id = ${id}`);
  const h = head.rows[0] as Record<string, unknown> | undefined;
  if (!h || (!Number(h.n) && !fallbackTitle)) return null;
  const rawTitle = String(h.title ?? fallbackTitle), event = String(h.event ?? ""), cat = String(h.category ?? "world");
  const labels = outcomeNames(humanLine({ title: rawTitle }), String(h.yes_label ?? "Yes"), String(h.no_label ?? "No"));
  const result: MarketView["result"] = h.void ? "void" : h.won_side === "yes" || h.lost_side === "no" ? "yes" : h.won_side === "no" || h.lost_side === "yes" ? "no" : null;
  const [all, twins, infos, rel] = await Promise.all([
    recentBets(db, { now, marketId: id, all: true, limit: 500, member: true }),
    twinOf(db, [id]).catch(() => new Map<string, MarketTwin>()),
    infoFor(db, "polymarket", [id]).catch(() => new Map()),
    db.execute(sql`select market_id as id, max(market_title) as title, sum(amount)::float as total from terminal.millionaire_bets
      where market_id <> ${id} and ((${event} <> '' and event_title = ${event}) or category = ${cat}) and at > ${new Date(now - 14 * 86_400_000)}
      group by market_id order by bool_or(event_title = ${event}) desc, sum(amount) desc limit 6`).catch(() => ({ rows: [] })),
  ]);
  const money = { millionaire: empty(), pro: empty(), total: 0 };
  const wallets = { millionaire: { yes: new Set<string>(), no: new Set<string>() }, pro: { yes: new Set<string>(), no: new Set<string>() } };
  for (const b of all) {
    if (!b.side) continue;
    money[b.tier][b.side].dollars += b.amount; money.total += b.amount;
    if (b.wallet) wallets[b.tier][b.side].add(b.wallet);
  }
  for (const t of ["millionaire", "pro"] as const) for (const s of ["yes", "no"] as const) money[t][s].wallets = wallets[t][s].size;
  const info = infos.get(id) ?? null;
  // A market no watchlist wallet bet on yet: its link from the large positions or the matcher's copy.
  const url = h.url ? String(h.url) : ((await db.execute(sql`select url from terminal.moves where market_id = ${id} and url is not null limit 1`).catch(() => ({ rows: [] }))).rows[0] as { url: string } | undefined)?.url ?? null;
  const priceNow = typeof info?.yesPrice === "number" ? info.yesPrice : null;
  // The chart: Polymarket's history (5 minutes in memory); each entry on the YES scale.
  const first = all.length ? Math.min(...all.map(b => b.at)) : now - 7 * 86_400_000;
  const history = info ? await memo(`entity-history:${id}`, 5 * 60_000, () => priceHistory((clients ??= { polymarket: new PolymarketClient(), kalshi: new KalshiClient() }), "polymarket", id, info, first - 86_400_000, now)).catch(() => []) : [];
  const chart = history.map(p => ({ t: p.t, v: p.p }));
  const dots = member ? all.filter(b => b.priceThen !== null && b.side).map(b => ({ t: b.at, v: b.side === "yes" ? b.priceThen! : 1 - b.priceThen!, r: Math.max(8, Math.min(22, Math.sqrt(b.amount / 2_000))), title: `${b.short}: $${Math.round(b.amount).toLocaleString("en-US")} on ${b.outcome}` })) : [];
  // Visitors: the board's rules (60 minutes late, no side).
  const bets = member ? all : await recentBets(db, { now, marketId: id, all: true, limit: 500, member: false, delayMs: VISITOR_DELAY_MS });
  return {
    id, slug: marketPath(id, rawTitle).slice("/market/".length), title: humanLine({ title: rawTitle }), event, category: isCategory(cat) ? cat : "world",
    yesLabel: labels.yesLabel, noLabel: labels.noLabel, url, priceNow, closed: Boolean(info?.closed) || result !== null, result,
    twin: twins.get(id) ?? null, money, bets, betCount: all.length, chart, dots,
    related: (rel.rows as Array<{ id: string; title: string; total: number }>).map(r => ({ id: r.id, title: humanLine({ title: r.title }), href: marketPath(r.id, r.title), total: Number(r.total) })),
  };
}

/** For metadata and link previews: the title and the money, without the bets. */
export async function marketHead(db: Db, id: string): Promise<{ title: string; total: number; wallets: number } | null> {
  const r = await db.execute(sql`select max(market_title) as title, sum(amount)::float as total, count(distinct wallet)::int as wallets from terminal.millionaire_bets where market_id = ${id}`);
  const x = r.rows[0] as { title: string | null; total: number | null; wallets: number } | undefined;
  return x?.title ? { title: humanLine({ title: x.title }), total: Number(x.total ?? 0), wallets: Number(x.wallets) } : null;
}

