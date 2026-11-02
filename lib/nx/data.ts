/* The data behind the new home page and member pages (server only). Every number comes from the database or a venue;
 * an item whose data is missing is left out, never shown with a placeholder.
 *   Categories   Elections · Sports · Economy · World · Culture, from a market's tab, category and words.
 *   Cards        open markets with tracked large positions: a licensed topic photo (or, for a game, the two team
 *                logos), the title with full team names, the proven-money split in dollars (lib/read/proven-sql.ts),
 *                the YES price, 24h volume, and a sparkline from Polymarket's price history when there is one. A Kalshi
 *                market paired with a Polymarket one is one card (its money folded in, turned when the pair is inverted).
 *   Chips        the busiest open market in each category.
 *   Proof        the best winning tracker's all-time followable record.
 *   Ticker       the latest big bets, every category.
 *   Record       top trackers per window (1W, 1M, 3M, all time).
 *   Featured     until the polls close (ELECTION_END), the election market with the most proven money; after, the
 *                busiest market. */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { MIN_SETTLED } from "@/lib/follow/math";
import { isWinner, trackerFollowAll } from "@/lib/follow/records";
import { matchupOf } from "@/lib/logos";
import { readPolyHistory } from "@/lib/markets/info";
import { memo } from "@/lib/memo";
import { notComboSql } from "@/lib/moves/combos";
import { subjectPhoto, type PhotoName } from "@/lib/photos";
import { winningTrackers } from "@/lib/read/build";
import { provenPredicate } from "@/lib/read/proven-sql";
import type { Venue } from "@/lib/read/types";
import { fullTeamNames } from "@/lib/sports/team-names";
import { PERIODS, TRACKERS } from "@/lib/trackers";

const DAY = 86_400_000;

/* ---------- categories ---------- */

export type Cat = "elections" | "sports" | "economy" | "world" | "culture";
export const CATS: ReadonlyArray<{ key: Cat; label: string }> = [
  { key: "elections", label: "Elections" }, { key: "sports", label: "Sports" }, { key: "economy", label: "Economy" },
  { key: "world", label: "World" }, { key: "culture", label: "Culture" },
];
export const isCat = (v: unknown): v is Cat => CATS.some(c => c.key === v);

/** A market's category from its tab, the venue's category and its words; null for stocks and anything unplaced. */
export function catOf(m: { tab: string | null; category: string | null; text?: string | null }): Cat | null {
  if (m.tab === "sports") return "sports";
  if (m.tab === "stocks") return null;
  const c = (m.category ?? "").toLowerCase(), t = m.text ?? "";
  if (c === "politics" || c === "elections") return "elections";
  if (c === "economy" || c === "crypto" || c === "finance" || m.tab === "crypto") return "economy";
  if (c === "geopolitics" || c === "world") return "world";
  if (c === "culture" || c === "tech" || c === "science" || c === "entertainment") return "culture";
  if (/election|senate|house|governor|mayor|primary|nominee|democrat|republican|ballot|midterm/i.test(t)) return "elections";
  if (/(^|[^a-z])(fed|fomc|powell)([^a-z]|$)|interest rate|inflation|cpi|gdp|recession|bitcoin|ethereum/i.test(t)) return "economy";
  if (/war|ceasefire|nato|russia|ukraine|china|taiwan|israel|iran|gaza|treaty|summit/i.test(t)) return "world";
  return c ? "culture" : null;
}

/** SQL over terminal.moves for one category (the same rule as catOf, on the columns). */
export function catSql(c: Cat): SQL {
  const M = sql`terminal.moves`;
  const words = sql`(coalesce(${M}.event_title, '') || ' ' || coalesce(${M}.market_title, ''))`;
  switch (c) {
    case "sports": return sql`${M}.tab = 'sports'`;
    case "elections": return sql`(${M}.tab <> 'sports' and (${M}.category in ('politics', 'elections') or (coalesce(${M}.category, '') = '' and ${words} ~* 'election|senate|house|governor|mayor|primary|nominee|democrat|republican|ballot|midterm')))`;
    case "economy": return sql`(${M}.tab <> 'sports' and (${M}.tab = 'crypto' or ${M}.category in ('economy', 'crypto', 'finance')))`;
    case "world": return sql`(${M}.tab <> 'sports' and ${M}.category in ('geopolitics', 'world'))`;
    case "culture": return sql`(${M}.tab <> 'sports' and ${M}.category in ('culture', 'tech', 'science', 'entertainment'))`;
  }
}

/* ---------- market cards ---------- */

export interface MarketCard {
  key: string; venue: Venue; id: string;
  title: string; event: string | null; cat: Cat;
  /** A licensed topic photo (lib/photos.ts). */
  photo: PhotoName;
  /** A game's two team logos (32px), in title order; null otherwise. */
  logos: [string, string] | null;
  yesLabel: string; noLabel: string;
  /** Proven money's open dollars by side (main listing's sides). */
  proven: { yes: number; no: number };
  /** Every open tracked large position by side. */
  money: { yes: number; no: number };
  /** YES price now, 0..1; null when unknown (the price is then hidden). */
  yesPrice: number | null;
  volume24h: number | null;
  /** Polymarket CLOB token for price history; null when there is none (no sparkline). */
  historyKey: string | null;
  /** Price history (YES, oldest first) when it was read; empty → no chart. */
  spark: number[];
  /** When the game starts (sports), ms. */
  startAt: number | null;
}

interface Row {
  source: Venue; market_id: string; title: string; event: string | null; tab: string; category: string | null; league: string | null;
  yes_out: string | null; no_out: string | null;
  m_yes: number; m_no: number; p_yes: number; p_no: number; volume: number | null; yes_price: number | null; history_key: string | null; start_at: string | Date | null;
  pair_poly: string | null; inverted: boolean | null;
}

/** Open markets as cards, busiest (24h volume + tracked money) first; `where` narrows the positions considered. */
export async function marketCards(db: Db, now: number, o: { cat?: Cat | null; where?: SQL | null; q?: string | null; limit?: number; sort?: "busiest" | "proven" } = {}): Promise<MarketCard[]> {
  const limit = o.limit ?? 12;
  const proven = await provenPredicate(db, now);
  const conds = [sql`terminal.moves.hidden_at is null`, sql`terminal.moves.result is null`, sql`terminal.moves.source in ('polymarket', 'kalshi')`, notComboSql,
    sql`terminal.moves.at > ${new Date(now - 60 * DAY)}`];
  if (o.cat) conds.push(catSql(o.cat));
  if (o.where) conds.push(o.where);
  if (o.q?.trim()) for (const w of o.q.trim().split(/\s+/).slice(0, 5)) conds.push(sql`(terminal.moves.event_title ilike ${`%${w}%`} or terminal.moves.market_title ilike ${`%${w}%`})`);
  const order = o.sort === "proven" ? sql`(p.p_yes + p.p_no) desc, coalesce((mk.data->>'volume24h')::float, 0) + p.m_yes + p.m_no desc` : sql`coalesce((mk.data->>'volume24h')::float, 0) + p.m_yes + p.m_no desc`;
  const r = await db.execute(sql`select p.*, (mk.data->>'volume24h')::float as volume, coalesce(i.yes_price, (mk.data->>'yesPrice')::float) as yes_price, i.history_key, i.start_at,
      pr.poly as pair_poly, pr.inverted
    from (
      select terminal.moves.source, terminal.moves.market_id, max(market_title) as title, max(event_title) as event, max(tab) as tab, max(category) as category, max(league) as league,
        max(case when outcome_side = 'yes' then outcome end) as yes_out, max(case when outcome_side = 'no' then outcome end) as no_out,
        coalesce(sum(amount) filter (where outcome_side = 'yes'), 0)::float as m_yes, coalesce(sum(amount) filter (where outcome_side = 'no'), 0)::float as m_no,
        coalesce(sum(amount) filter (where outcome_side = 'yes' and ${proven}), 0)::float as p_yes, coalesce(sum(amount) filter (where outcome_side = 'no' and ${proven}), 0)::float as p_no
      from terminal.moves where ${sql.join(conds, sql` and `)}
      group by terminal.moves.source, terminal.moves.market_id) p
    left join terminal.market_info i on i.source = p.source and i.market_id = p.market_id
    left join terminal.markets mk on mk.venue = p.source and mk.id = p.market_id
    left join lateral (select case when data->'a'->>'venue' = 'polymarket' then data->'a'->>'id' else data->'b'->>'id' end as poly, coalesce((data->>'inverted')::boolean, false) as inverted
      from terminal.pairs where not blocked and p.source = 'kalshi' and ((data->'a'->>'venue' = 'kalshi' and data->'a'->>'id' = p.market_id) or (data->'b'->>'venue' = 'kalshi' and data->'b'->>'id' = p.market_id)) limit 1) pr on true
    where coalesce(i.closed, false) = false
    order by ${order} limit ${limit * 4}`);
  const out = new Map<string, MarketCard>();
  for (const x of r.rows as unknown as Row[]) {
    const cat = catOf({ tab: x.tab, category: x.category, text: `${x.event ?? ""} ${x.title}` });
    if (!cat) continue;
    const poly = x.source === "kalshi" ? x.pair_poly : x.market_id;
    const flip = x.source === "kalshi" && Boolean(x.pair_poly) && Boolean(x.inverted);
    const side = (y: number, n: number) => (flip ? { yes: n, no: y } : { yes: y, no: n });
    const venue: Venue = poly ? "polymarket" : x.source, id = poly ?? x.market_id, key = `${venue === "polymarket" ? "p" : "k"}:${id}`;
    const title = fullTeamNames(x.title, x.league);
    const logos = matchupOf({ tab: x.tab, league: x.league, marketTitle: title, eventTitle: x.event });
    const yesPrice = x.yes_price === null || x.yes_price === undefined ? null : flip ? 1 - Number(x.yes_price) : Number(x.yes_price);
    const card: MarketCard = { key, venue, id, title, event: x.event, cat,
      photo: subjectPhoto({ tab: x.tab, category: x.category, league: x.league, text: `${x.event ?? ""} ${x.title}` }), logos,
      yesLabel: x.yes_out ?? "Yes", noLabel: x.no_out ?? "No",
      proven: side(Number(x.p_yes), Number(x.p_no)), money: side(Number(x.m_yes), Number(x.m_no)),
      yesPrice, volume24h: x.volume === null || x.volume === undefined ? null : Number(x.volume),
      historyKey: x.source === "polymarket" ? x.history_key : null, spark: [], startAt: x.start_at ? new Date(x.start_at).getTime() : null };
    const cur = out.get(key);
    if (!cur) { out.set(key, card); continue; }
    // A pair: add the other listing's money; the Polymarket listing's own words, price and history win.
    cur.money = { yes: cur.money.yes + card.money.yes, no: cur.money.no + card.money.no };
    cur.proven = { yes: cur.proven.yes + card.proven.yes, no: cur.proven.no + card.proven.no };
    if (x.source === "polymarket") Object.assign(cur, { title: card.title, event: card.event, yesLabel: card.yesLabel, noLabel: card.noLabel, yesPrice: card.yesPrice ?? cur.yesPrice, historyKey: card.historyKey, volume24h: card.volume24h ?? cur.volume24h });
    else cur.yesPrice ??= card.yesPrice;
  }
  // Two listings with the same words read as one market to a person: keep the busiest (the list is busiest first).
  const byTitle = new Map<string, MarketCard>();
  for (const c of out.values()) { const t = c.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); if (!byTitle.has(t)) byTitle.set(t, c); }
  const list = [...byTitle.values()];
  if (o.sort === "proven") list.sort((a, b) => (b.proven.yes + b.proven.no) - (a.proven.yes + a.proven.no));
  return list.slice(0, limit);
}

/* ---------- sparklines ---------- */

/** Up to n points, evenly picked from the last `days` of history. */
export function downsample(points: ReadonlyArray<{ t: number; p: number }>, now: number, days = 7, n = 32): number[] {
  const recent = points.filter(x => x.t >= now - days * DAY);
  if (recent.length < 2) return [];
  if (recent.length <= n) return recent.map(x => x.p);
  return Array.from({ length: n }, (_, i) => recent[Math.round((i * (recent.length - 1)) / (n - 1))]!.p);
}

/** Fills cards' sparklines from Polymarket's price history (cached 15 minutes per market). Waits at most `ms`: a
 *  history still loading is left out this time and shows on a later render. */
export async function withSparks(cards: MarketCard[], poly: Pick<PolymarketClient, "getPriceHistory">, now: number, ms = 1_200): Promise<MarketCard[]> {
  const jobs = cards.map(async c => {
    if (!c.historyKey) return;
    const h = memo(`nx:spark:${c.historyKey}`, 15 * 60_000, async () => downsample(readPolyHistory(await poly.getPriceHistory(c.historyKey!).catch(() => null)), now));
    c.spark = (await Promise.race([h, new Promise<number[]>(ok => setTimeout(() => ok([]), ms))])) ?? [];
  });
  await Promise.all(jobs);
  return cards;
}

/* ---------- chips, proof, ticker, record ---------- */

/** The busiest open market in each category (up to n): the hero's suggestion chips. */
export async function suggestionChips(db: Db, now: number, n = 5, cats: readonly Cat[] = CATS.map(c => c.key)): Promise<MarketCard[]> {
  const per = await Promise.all(cats.map(c => marketCards(db, now, { cat: c, limit: 1 }).catch(() => [] as MarketCard[])));
  return per.flat().slice(0, n);
}

/** A chip's words: the event's name when it's short (Senate control), else the market's. */
export const chipText = (c: Pick<MarketCard, "title" | "event">): string => {
  const e = c.event?.replace(/^[A-Z]{2,5}:\s*/, "").trim();
  const t = e && e.length <= 32 ? e : c.title;
  return t.length > 40 ? `${t.slice(0, 38).trimEnd()}…` : t;
};

export interface Proof { slug: string; name: string; returnPct: number; settled: number }
/** The best winning tracker by all-time followable return. */
export async function bestTracker(db: Db, now: number): Promise<Proof | null> {
  const w = await winningTrackers(db, now);
  const best = [...w.entries()].sort((a, b) => b[1].returnPct - a[1].returnPct)[0];
  return best ? { slug: best[0], ...best[1] } : null;
}

export interface TickerBet { id: string; amount: number; side: string; price: number; at: number; cat: Cat | null }
/** The latest big bets, any category (newest first). */
export async function tickerBets(db: Db, now: number, n = 18): Promise<TickerBet[]> {
  const r = await db.execute(sql`select id, amount::float as amount, outcome, league, avg_price::float as price, at, tab, category, market_title, event_title from terminal.moves
    where hidden_at is null and source in ('polymarket', 'kalshi') and ${notComboSql} and at > ${new Date(now - DAY)} and at <= ${new Date(now)} and avg_price > 0 and avg_price < 1
    order by at desc limit ${n}`);
  return (r.rows as Array<{ id: string; amount: number; outcome: string | null; league: string | null; price: number; at: string | Date; tab: string; category: string | null; market_title: string; event_title: string | null }>)
    .filter(x => x.outcome)
    .map(x => ({ id: x.id, amount: Number(x.amount), side: fullTeamNames(x.outcome!, x.league), price: Number(x.price), at: new Date(x.at).getTime(),
      cat: catOf({ tab: x.tab, category: x.category, text: `${x.event_title ?? ""} ${x.market_title}` }) }));
}

export interface RecordRow { slug: string; name: string; returnPct: number; settled: number }
export const RECORD_WINDOWS = [{ key: "1w", label: "1W" }, { key: "1m", label: "1M" }, { key: "3m", label: "3M" }, { key: "all", label: "All" }] as const;
export type RecordWindow = (typeof RECORD_WINDOWS)[number]["key"];
/** In a window shorter than all time, a tracker needs this many settled positions to be ranked. */
export const WINDOW_MIN = 10;
/** Top trackers per window by followable return: all time needs a winning record (30+ settled, positive); a shorter
 *  window needs WINDOW_MIN settled in it. Losses count. */
export async function recordWindows(db: Db, now: number, n = 5): Promise<Record<RecordWindow, RecordRow[]>> {
  const all = await trackerFollowAll(db, now);
  const out = {} as Record<RecordWindow, RecordRow[]>;
  for (const w of RECORD_WINDOWS) {
    const rows: RecordRow[] = [];
    for (const t of TRACKERS) {
      if (t.kind !== "bets") continue;
      const r = all.get(t.slug)?.[w.key];
      if (!r || r.staked <= 0) continue;
      if (w.key === "all" ? !isWinner(r) : r.n < WINDOW_MIN) continue;
      rows.push({ slug: t.slug, name: t.name, returnPct: r.net / r.staked, settled: r.n });
    }
    out[w.key] = rows.sort((a, b) => b.returnPct - a.returnPct).slice(0, n);
  }
  void PERIODS; void MIN_SETTLED;
  return out;
}

/* ---------- the election switch and the featured market ---------- */

/** Polls close on Tuesday, Nov 3, 2026; the election framing (announcement bar, Capitol photo, election market) holds
 *  through Nov 4 and ends at midnight ET. */
export const ELECTION_END = Date.parse("2026-11-05T05:00:00Z");
export const electionMode = (now: number): boolean => now < ELECTION_END;

/** Until ELECTION_END the election market with the most proven money; after, the busiest market. */
export async function featuredMarket(db: Db, now: number): Promise<MarketCard | null> {
  if (electionMode(now)) {
    const e = await marketCards(db, now, { cat: "elections", limit: 1, sort: "proven" });
    if (e[0] && e[0].proven.yes + e[0].proven.no > 0) return e[0];
  }
  return (await marketCards(db, now, { limit: 1 }))[0] ?? null;
}

export type Clients = { polymarket: PolymarketClient; kalshi: KalshiClient };

/* ---------- related markets (the Read page) ---------- */

/** Up to n other open markets from the same event, then the same category, busiest first. */
export async function relatedCards(db: Db, now: number, d: { key: string; event: string | null; polymarket: { id: string } | null; kalshi: { id: string } | null }, n = 3): Promise<MarketCard[]> {
  const ids = [d.polymarket?.id, d.kalshi?.id].filter((x): x is string => Boolean(x));
  if (!ids.length) return [];
  const r = await db.execute(sql`select tab, category, event_title, market_title from terminal.moves where market_id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) limit 1`);
  const m = r.rows[0] as { tab: string; category: string | null; event_title: string | null; market_title: string } | undefined;
  const out: MarketCard[] = [], seen = new Set([d.key]);
  const add = (cs: MarketCard[]) => { for (const c of cs) if (out.length < n && !seen.has(c.key)) { seen.add(c.key); out.push(c); } };
  if (d.event) add(await marketCards(db, now, { where: sql`terminal.moves.event_title = ${d.event}`, limit: n + 1 }).catch(() => []));
  const cat = m ? catOf({ tab: m.tab, category: m.category, text: `${m.event_title ?? ""} ${m.market_title}` }) : null;
  if (out.length < n && cat) add(await marketCards(db, now, { cat, limit: n + 4 }).catch(() => []));
  return out;
}
