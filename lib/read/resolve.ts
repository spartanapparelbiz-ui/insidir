/* What someone gave → the market to read (server only).
 *   A link      Polymarket (an event, or one market in it) or Kalshi. An event with several open markets and no
 *               market named: its 3 busiest, to pick from.
 *   Words       "Senate control", "Lakers tonight": open markets on both venues that the matcher holds
 *               (terminal.markets), markets with big money we track (terminal.moves) and Polymarket's search, scored by
 *               how many of the words they share; one clear winner is read, else the best 3 are offered.
 *   A slip      a sportsbook screenshot (lib/check reads it): each leg matched like Check my bet; one leg is read,
 *               several are offered (up to 3).
 * A Kalshi market matched to a Polymarket one (terminal.pairs) is one choice, not two. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { matchLegMarket } from "@/lib/check/run";
import { readPasted, readSlip, toLeg } from "@/lib/check/extract";
import { checkSpend } from "@/lib/check/spend";
import type { VMarket } from "@/lib/types";
import { pairOf, VENUE_MS, type Clients } from "./build";
import { choose, queryWords, textScore } from "./math";
import type { Choice, Resolved, Venue } from "./types";

function within<T>(p: Promise<T>, fallback: T, ms = VENUE_MS): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>(ok => setTimeout(() => ok(fallback), ms))]);
}

const choiceOf = (venue: Venue, m: { id: string; title: string; eventTitle: string | null; yesPrice?: number | null }): Choice =>
  ({ key: `${venue === "polymarket" ? "p" : "k"}:${m.id}`, venue, id: m.id, title: m.title, event: m.eventTitle, yesPrice: m.yesPrice ?? null });

/** Kalshi choices matched to a Polymarket market take that market's key, so a pair is offered once. */
async function pairKeys(db: Db, list: Choice[]): Promise<Choice[]> {
  return Promise.all(list.map(async c => {
    if (c.venue !== "kalshi") return c;
    const p = await pairOf(db, "kalshi", c.id);
    return p.polymarket ? { ...c, key: `p:${p.polymarket}` } : c;
  }));
}

export async function resolveLink(db: Db, clients: Clients, text: string): Promise<Resolved | null> {
  const p = readPasted(text);
  if (!p) return null;
  if (p.kind === "ticker") return { kind: "none", why: "Stocks aren't covered. Paste a Polymarket or Kalshi market, or type one in plain words." };
  if (p.kind === "kalshi") return { kind: "market", venue: "kalshi", id: p.ticker };
  const ev = await within(clients.polymarket.getEventBySlug(p.slug), null);
  const open = (ev?.markets ?? []).filter(m => m.active && !m.result);
  const named = p.market ? open.find(m => m.url.toLowerCase().endsWith(`/${p.market}`)) : undefined;
  if (named) return { kind: "market", venue: "polymarket", id: named.id };
  if (open.length === 1) return { kind: "market", venue: "polymarket", id: open[0]!.id };
  if (open.length > 1) return { kind: "choices", list: [...open].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, 3).map(m => choiceOf("polymarket", m)) };
  if (ev) return { kind: "none", why: "That event has no open markets." };
  // Polymarket didn't answer: the markets we hold under that link.
  const like = `%/event/${p.slug}${p.market ? `/${p.market}` : ""}%`;
  const r = await db.execute(sql`select id, title, event, yes, vol from (
      select id, data->>'title' as title, data->>'eventTitle' as event, (data->>'yesPrice')::float as yes, coalesce((data->>'volume24h')::float, 0) as vol
        from terminal.markets where venue = 'polymarket' and data->>'url' ilike ${like} and data->>'result' is null
      union all
      select market_id, max(market_title), max(event_title), null::float, sum(amount)::float from terminal.moves
        where source = 'polymarket' and url ilike ${like} and result is null and hidden_at is null group by market_id) x order by vol desc limit 3`);
  const rows = r.rows as Array<{ id: string; title: string; event: string | null; yes: number | null }>;
  const uniq = [...new Map(rows.map(x => [x.id, x])).values()];
  if (uniq.length === 1) return { kind: "market", venue: "polymarket", id: uniq[0]!.id };
  if (uniq.length > 1) return { kind: "choices", list: uniq.map(x => choiceOf("polymarket", { id: x.id, title: x.title, eventTitle: x.event, yesPrice: x.yes })) };
  return { kind: "none", why: "We couldn't open that link. Check it, or type the market in plain words." };
}

export async function resolveWords(db: Db, clients: Clients, text: string, now: number): Promise<Resolved> {
  const w = queryWords(text).filter(x => x.length >= 3).slice(0, 6);
  if (!w.length) return { kind: "none", why: "Type a market in a few words, like “Senate control” or “Lakers tonight”." };
  const like = sql.join(w.map(x => sql`(data->>'title' ilike ${`%${x}%`} or data->>'eventTitle' ilike ${`%${x}%`})`), sql` or `);
  const likeMoves = sql.join(w.map(x => sql`(event_title ilike ${`%${x}%`} or market_title ilike ${`%${x}%`})`), sql` or `);
  const [stored, tracked, search] = await Promise.all([
    db.execute(sql`select venue, id, data->>'title' as title, data->>'eventTitle' as event, (data->>'yesPrice')::float as yes, coalesce((data->>'volume24h')::float, 0) as vol
      from terminal.markets where venue in ('polymarket', 'kalshi') and coalesce((data->>'active')::boolean, true) and data->>'result' is null
      and (data->>'closeTime' is null or (data->>'closeTime')::float > ${now}) and (${like}) limit 400`),
    db.execute(sql`select source as venue, market_id as id, max(market_title) as title, max(event_title) as event, sum(amount)::float as vol
      from terminal.moves where source in ('polymarket', 'kalshi') and hidden_at is null and result is null and at > ${new Date(now - 30 * 86_400_000)} and (${likeMoves})
      group by source, market_id limit 200`),
    within(clients.polymarket.searchEvents(text.slice(0, 120)), [] as Array<{ markets: VMarket[] }>),
  ]);
  const scored: Array<Choice & { score: number; volume: number }> = [];
  const push = (venue: Venue, m: { id: string; title: string; eventTitle: string | null; yesPrice?: number | null }, volume: number) =>
    scored.push({ ...choiceOf(venue, m), score: textScore(text, m.title, m.eventTitle), volume });
  for (const r of stored.rows as Array<{ venue: Venue; id: string; title: string; event: string | null; yes: number | null; vol: number }>) push(r.venue, { id: r.id, title: r.title, eventTitle: r.event, yesPrice: r.yes }, Number(r.vol));
  for (const r of tracked.rows as Array<{ venue: Venue; id: string; title: string; event: string | null; vol: number }>) push(r.venue, { id: r.id, title: r.title, eventTitle: r.event }, Number(r.vol));
  for (const e of search) for (const m of e.markets) if (m.active && !m.result) push("polymarket", { id: m.id, title: m.title, eventTitle: m.eventTitle, yesPrice: m.yesPrice }, m.volume24h ?? 0);
  // Best score per market (it may come from more than one source), Kalshi pairs folded into their Polymarket market.
  const best = new Map<string, Choice & { score: number; volume: number }>();
  for (const c of scored) { const k = `${c.venue}:${c.id}`, cur = best.get(k); if (!cur || c.score > cur.score || (c.score === cur.score && c.volume > cur.volume)) best.set(k, c); }
  const top = [...best.values()].sort((a, b) => b.score - a.score || b.volume - a.volume).slice(0, 12);
  const keyed = await pairKeys(db, top);
  return choose(keyed.map((c, i) => ({ ...c, score: top[i]!.score, volume: top[i]!.volume })));
}

export async function resolveSlip(db: Db, clients: Clients, image: { data: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" }, now: number): Promise<Resolved> {
  const slip = await readSlip(image, checkSpend(db, now));
  const legs = slip.legs.slice(0, 3).map(toLeg).filter(l => l.marketType !== "stock");
  const found = (await Promise.all(legs.map(l => matchLegMarket(db, clients, l, now)))).filter((c): c is NonNullable<typeof c> => c !== null);
  if (!found.length) return { kind: "none", why: "We couldn't match that slip to a market on Polymarket or Kalshi. Try a link, or type it in plain words." };
  if (found.length === 1) return { kind: "market", venue: found[0]!.source, id: found[0]!.marketId };
  return { kind: "choices", list: found.map(c => choiceOf(c.source, { id: c.marketId, title: c.title, eventTitle: c.eventTitle, yesPrice: c.yesPrice })) };
}

/** Text in the box: a link, else plain words. */
export async function resolveText(db: Db, clients: Clients, text: string, now: number): Promise<Resolved> {
  return (await resolveLink(db, clients, text)) ?? resolveWords(db, clients, text, now);
}
