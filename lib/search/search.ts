/* Search (⌘K): markets, races and wallets by what someone typed, or the market a pasted Polymarket or Kalshi link
 * points at (server only).
 *   A link      Polymarket (an event, or one market in it) or Kalshi (a market or event ticker): its market page when
 *               it names one market, else the markets under it to pick from.
 *   Words       open markets whose title or event holds every word (terminal.markets and the millionaire bets),
 *               busiest first; the major races among them (control of a chamber, a Senate or governor seat).
 *   0x…         watchlist wallets by address. Only the short address, never a name.
 * Data, never advice. */
import { marketPath } from "@/lib/entities/slug";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { majorRace } from "@/lib/brand/pulse";
import { humanLine } from "@/lib/markets/title";

export interface Hit { kind: "market" | "race" | "wallet"; title: string; sub: string | null; href: string }
interface SearchResult { go: string | null; hits: Hit[]; note?: string }

type Pasted = { venue: "polymarket"; slug: string; market: string | null } | { venue: "kalshi"; ticker: string };

/** A Polymarket or Kalshi link in the text, or null. */
function parseLink(text: string): Pasted | null {
  const pm = /polymarket\.com\/(?:[a-z]{2}\/)?(?:event|market)\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?/i.exec(text);
  if (pm) return { venue: "polymarket", slug: pm[1]!.toLowerCase(), market: pm[2]?.toLowerCase() ?? null };
  const ks = /kalshi\.com\/markets\/(?:[^/\s?#]+\/)*([a-z0-9][a-z0-9.\-]+)/i.exec(text);
  if (ks) return { venue: "kalshi", ticker: ks[1]!.toUpperCase() };
  return null;
}

const marketHref = (id: string, title = ""): string => marketPath(id, title);
const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

interface Row { id: string; title: string; event: string | null; vol: number }

function hitOf(r: Row): Hit {
  const title = humanLine({ title: r.title });
  return { kind: majorRace(r.title) ? "race" : "market", title, sub: r.event && r.event !== r.title ? humanLine({ title: r.event }) : null, href: marketHref(r.id, r.title) };
}

async function byLink(db: Db, p: Pasted): Promise<SearchResult> {
  if (p.venue === "kalshi") {
    // A Kalshi market has a page through its approved Polymarket twin (the market, event or series the link names).
    const r = await db.execute(sql`select polymarket_id as id, polymarket_title as title, null as event, 0::float as vol from terminal.market_twins
      where status = 'approved' and (upper(kalshi_id) = ${p.ticker} or upper(kalshi_id) like ${`${p.ticker}-%`}) order by (upper(kalshi_id) = ${p.ticker}) desc limit 8`);
    const rows = r.rows as unknown as Row[];
    if (rows.length === 1) return { go: marketHref(rows[0]!.id, rows[0]!.title), hits: [] };
    return { go: null, hits: rows.map(hitOf), ...(rows.length ? {} : { note: "That Kalshi market isn't matched to a Polymarket market yet, so there is no page for it." }) };
  }

  const like = `%/event/${p.slug}${p.market ? `/${p.market}` : ""}%`;
  const r = await db.execute(sql`select id, max(title) as title, max(event) as event, max(vol) as vol, bool_or(named) as named from (
      select id, data->>'title' as title, data->>'eventTitle' as event, coalesce((data->>'volume24h')::float, 0) as vol,
        ${p.market ? sql`data->>'url' ilike ${`%/${p.market}`}` : sql`false`} as named
        from terminal.markets where venue = 'polymarket' and data->>'url' ilike ${like} and data->>'result' is null
      union all
      select market_id, market_title, event_title, sum(amount)::float, ${p.market ? sql`max(url) ilike ${`%/${p.market}`}` : sql`false`}
        from terminal.millionaire_bets where url ilike ${like} group by market_id, market_title, event_title) x
    group by id order by bool_or(named) desc, max(vol) desc limit 8`);
  const rows = r.rows as unknown as Array<Row & { named: boolean }>;
  const named = rows.find(x => x.named);
  if (named || rows.length === 1) return { go: marketHref((named ?? rows[0]!).id), hits: [] };
  return { go: null, hits: rows.map(hitOf) };
}

async function byWords(db: Db, q: string): Promise<SearchResult> {
  const words = q.toLowerCase().split(/[^a-z0-9.]+/).filter(w => w.length >= 2).slice(0, 6);
  if (!words.length) return { go: null, hits: [] };
  const all = (col: string) => sql.join(words.map(w => sql`${sql.raw(col)} ilike ${`%${w}%`}`), sql` and `);
  const r = await db.execute(sql`select id, max(title) as title, max(event) as event, sum(vol)::float as vol from (
      select id, data->>'title' as title, data->>'eventTitle' as event, coalesce((data->>'volume24h')::float, 0) as vol
        from terminal.markets where venue = 'polymarket' and data->>'result' is null and (${all("data->>'title'")} or ${all("coalesce(data->>'eventTitle', '')")})
      union all
      select market_id, market_title, event_title, sum(amount)::float from terminal.millionaire_bets
        where (${all("market_title")} or ${all("event_title")}) group by market_id, market_title, event_title) x
    group by id order by sum(vol) desc limit 12`);
  const hits = (r.rows as unknown as Row[]).map(hitOf);
  // Races first: a race is what someone typing a state and an office means.
  return { go: null, hits: [...hits.filter(h => h.kind === "race"), ...hits.filter(h => h.kind !== "race")].slice(0, 10) };
}

async function byWallet(db: Db, q: string): Promise<SearchResult> {
  const w = q.toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(w)) return { go: `/wallet/${w}`, hits: [] };
  const r = await db.execute(sql`select wallet, tier, pnl from terminal.watchlist where wallet like ${`${w}%`} order by pnl desc limit 8`);
  return { go: null, hits: (r.rows as Array<{ wallet: string; tier: string; pnl: number }>).map(x => ({ kind: "wallet" as const, title: short(x.wallet), sub: x.tier === "millionaire" ? "Wallet up $1M+" : "Wallet up $100K+", href: `/wallet/${x.wallet}` })) };
}

export async function search(db: Db, text: string): Promise<SearchResult> {
  const q = text.trim().slice(0, 300);
  if (!q) return { go: null, hits: [] };
  const link = parseLink(q);
  if (link) return byLink(db, link);
  if (/^0x[0-9a-f]{3,40}$/i.test(q)) return byWallet(db, q);
  return byWords(db, q);
}
