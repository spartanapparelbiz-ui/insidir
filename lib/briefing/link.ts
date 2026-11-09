/* A pasted Polymarket or Kalshi link → the market a Bet Briefing is about (lib/search/search.ts parseLink reads it):
 *   Polymarket  the market slug in the link (else the event's), looked up on Polymarket (gamma ?slug=, then
 *               &closed=true): its condition id is Insidir's market id. An event with several markets lists them.
 *   Kalshi      its approved Polymarket twin (terminal.market_twins); none, and we say we don't have it.
 * Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { humanLine } from "@/lib/markets/title";
import { parseLink } from "@/lib/search/search";
import type { MarketFallback } from "./facts";

export type Resolved =
  | { kind: "market"; marketId: string; fallback: MarketFallback | null }
  | { kind: "pick"; options: Array<{ marketId: string; title: string }> }
  | { kind: "none"; note: string };

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
function outcomes(m: Record<string, unknown>): { yes: string; no: string; price: number | null } {
  const parse = (v: unknown): unknown[] => { try { return Array.isArray(v) ? v : typeof v === "string" ? JSON.parse(v) as unknown[] : []; } catch { return []; } };
  const o = parse(m.outcomes), p = parse(m.outcomePrices).map(Number);
  const yes = typeof o[0] === "string" ? o[0] : "Yes", no = typeof o[1] === "string" ? o[1] : "No";
  return { yes, no, price: Number.isFinite(p[0]) && p[0]! > 0 && p[0]! < 1 ? p[0]! : null };
}

async function gamma(path: string, f: typeof fetch): Promise<Array<Record<string, unknown>>> {
  for (const closed of ["", "&closed=true"]) {
    const res = await f(`https://gamma-api.polymarket.com/${path}${closed}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (Array.isArray(body) && body.length) return body as Array<Record<string, unknown>>;
  }
  return [];
}

export async function resolvePasted(db: Db, text: string, f: typeof fetch = fetch): Promise<Resolved> {
  const p = parseLink(text);
  if (!p) return { kind: "none", note: "That isn't a Polymarket or Kalshi market link." };
  if (p.venue === "kalshi") {
    const r = (await db.execute(sql`select polymarket_id as id, polymarket_title as title from terminal.market_twins
      where status = 'approved' and (upper(kalshi_id) = ${p.ticker} or upper(kalshi_id) like ${`${p.ticker}-%`}) order by (upper(kalshi_id) = ${p.ticker}) desc limit 8`)).rows as Array<{ id: string; title: string }>;
    if (r.length === 1) return { kind: "market", marketId: r[0]!.id, fallback: null };
    if (r.length) return { kind: "pick", options: r.map(x => ({ marketId: x.id, title: humanLine({ title: x.title }) })) };
    return { kind: "none", note: "We don't have that Kalshi market matched to a Polymarket market yet, so there's no briefing for it." };
  }
  const url = (slug: string) => `https://polymarket.com/event/${p.slug}${slug !== p.slug ? `/${slug}` : ""}`;
  const asMarket = (m: Record<string, unknown>, slug: string): Resolved | null => {
    const id = str(m.conditionId), title = str(m.question);
    if (!id || !title) return null;
    const o = outcomes(m);
    return { kind: "market", marketId: id, fallback: { title, url: url(slug), yesLabel: o.yes, noLabel: o.no, yes: o.price } };
  };
  if (p.market) {
    const [m] = await gamma(`markets?slug=${encodeURIComponent(p.market)}`, f);
    const r = m ? asMarket(m, p.market) : null;
    if (r) return r;
  }
  // An event: its one market, or the list to pick from.
  const [m] = await gamma(`markets?slug=${encodeURIComponent(p.slug)}`, f);
  const one = m ? asMarket(m, p.slug) : null;
  if (one) return one;
  const [ev] = await gamma(`events?slug=${encodeURIComponent(p.slug)}`, f);
  const ms = Array.isArray(ev?.markets) ? (ev.markets as Array<Record<string, unknown>>) : [];
  const opts = ms.map(x => ({ marketId: str(x.conditionId), title: str(x.question) })).filter((x): x is { marketId: string; title: string } => Boolean(x.marketId && x.title));
  if (opts.length === 1) { const r = asMarket(ms[0]!, str(ms[0]!.slug) ?? p.slug); if (r) return r; }
  if (opts.length) return { kind: "pick", options: opts.slice(0, 30).map(o => ({ ...o, title: humanLine({ title: o.title }) })) };
  return { kind: "none", note: "Polymarket doesn't have a market at that link." };
}
