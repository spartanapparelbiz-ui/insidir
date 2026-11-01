/* What someone gave → the market to read (server only).
 *   A link      Polymarket (an event, or one market in it) or Kalshi. An event with several open markets and no
 *               market named: the busiest when it clearly leads, else its 3 busiest to pick from.
 *   Words       "Senate control", "Lakers tonight": open markets on both venues that the matcher holds
 *               (terminal.markets), markets with big money we track (terminal.moves) and Polymarket's search. Combos
 *               and parlays are left out unless the words ask for them. Ranked by how many of the words they share,
 *               then by 24h volume plus tracked big money, a Polymarket market with a Kalshi pair preferred; the top
 *               one is read when it clearly leads, else the best 3 are offered.
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
import { isCombo } from "@/lib/moves/combos";
import { chooseRanked, queryWords, textScore, type Candidate } from "./math";
import type { Choice, Resolved, Venue } from "./types";

function within<T>(p: Promise<T>, fallback: T, ms = VENUE_MS): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>(ok => setTimeout(() => ok(fallback), ms))]);
}

const choiceOf = (venue: Venue, m: { id: string; title: string; eventTitle: string | null; yesPrice?: number | null }): Choice =>
  ({ key: `${venue === "polymarket" ? "p" : "k"}:${m.id}`, venue, id: m.id, title: m.title, event: m.eventTitle, yesPrice: m.yesPrice ?? null });

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
  if (open.length > 1) return chooseRanked(await foldPairs(db, open.map(m => ({ ...choiceOf("polymarket", m), score: 1, volume: m.volume24h ?? 0, money: 0, paired: false }))));
  if (ev) return { kind: "none", why: "That event has no open markets." };
  // Polymarket didn't answer: the markets we hold under that link.
  const like = `%/event/${p.slug}${p.market ? `/${p.market}` : ""}%`;
  const r = await db.execute(sql`select id, title, event, yes, vol from (
      select id, data->>'title' as title, data->>'eventTitle' as event, (data->>'yesPrice')::float as yes, coalesce((data->>'volume24h')::float, 0) as vol
        from terminal.markets where venue = 'polymarket' and data->>'url' ilike ${like} and data->>'result' is null
      union all
      select market_id, max(market_title), max(event_title), null::float, sum(amount)::float from terminal.moves
        where source = 'polymarket' and url ilike ${like} and result is null and hidden_at is null group by market_id) x order by vol desc limit 3`);
  const rows = r.rows as Array<{ id: string; title: string; event: string | null; yes: number | null; vol: number }>;
  const uniq = [...new Map(rows.map(x => [x.id, x])).values()];
  if (uniq.length === 1) return { kind: "market", venue: "polymarket", id: uniq[0]!.id };
  if (uniq.length > 1) return chooseRanked(await foldPairs(db, uniq.map(x => ({ ...choiceOf("polymarket", { id: x.id, title: x.title, eventTitle: x.event, yesPrice: x.yes }), score: 1, volume: Number(x.vol), money: 0, paired: false }))));
  return { kind: "none", why: "We couldn't open that link. Check it, or type the market in plain words." };
}

/** Words that ask for a multi-leg bet; without them, combos and parlays (lib/moves/combos) are left out. */
const COMBO_WORDS = /\b(parlays?|combos?|multi-?legs?|sgp|same game)\b/i;

export async function resolveWords(db: Db, clients: Clients, text: string, now: number): Promise<Resolved> {
  const w = queryWords(text).filter(x => x.length >= 3).slice(0, 6);
  if (!w.length) return { kind: "none", why: "Type a market in a few words, like “Senate control” or “Lakers tonight”." };
  const asksCombo = COMBO_WORDS.test(text);
  const like = sql.join(w.map(x => sql`(data->>'title' ilike ${`%${x}%`} or data->>'eventTitle' ilike ${`%${x}%`})`), sql` or `);
  const likeMoves = sql.join(w.map(x => sql`(event_title ilike ${`%${x}%`} or market_title ilike ${`%${x}%`})`), sql` or `);
  const [stored, tracked, search] = await Promise.all([
    db.execute(sql`select venue, id, data->>'title' as title, data->>'eventTitle' as event, (data->>'yesPrice')::float as yes, coalesce((data->>'volume24h')::float, 0) as vol
      from terminal.markets where venue in ('polymarket', 'kalshi') and coalesce((data->>'active')::boolean, true) and data->>'result' is null
      and (data->>'closeTime' is null or (data->>'closeTime')::float > ${now}) and (${like}) limit 400`),
    db.execute(sql`select source as venue, market_id as id, max(market_title) as title, max(event_title) as event, sum(amount)::float as money
      from terminal.moves where source in ('polymarket', 'kalshi') and hidden_at is null and result is null and at > ${new Date(now - 30 * 86_400_000)} and (${likeMoves})
      group by source, market_id limit 200`),
    within(clients.polymarket.searchEvents(text.slice(0, 120)), [] as Array<{ markets: VMarket[] }>),
  ]);
  // Each market once, from every source that knows it: its best text score, 24h volume and tracked big money.
  const seen = new Map<string, Candidate>();
  const add = (venue: Venue, m: { id: string; title: string; eventTitle: string | null; yesPrice?: number | null }, v: { volume?: number; money?: number }) => {
    if (!asksCombo && isCombo({ source: venue, marketId: m.id, marketTitle: m.title, eventTitle: m.eventTitle })) return;
    const k = `${venue}:${m.id}`, cur = seen.get(k), score = textScore(text, m.title, m.eventTitle);
    if (!cur) { seen.set(k, { ...choiceOf(venue, m), score, volume: v.volume ?? 0, money: v.money ?? 0, paired: false }); return; }
    cur.score = Math.max(cur.score, score); cur.volume = Math.max(cur.volume, v.volume ?? 0); cur.money = Math.max(cur.money, v.money ?? 0);
    if (cur.yesPrice === null && m.yesPrice != null) cur.yesPrice = m.yesPrice;
  };
  for (const r of stored.rows as Array<{ venue: Venue; id: string; title: string; event: string | null; yes: number | null; vol: number }>) add(r.venue, { id: r.id, title: r.title, eventTitle: r.event, yesPrice: r.yes }, { volume: Number(r.vol) });
  for (const r of tracked.rows as Array<{ venue: Venue; id: string; title: string; event: string | null; money: number }>) add(r.venue, { id: r.id, title: r.title, eventTitle: r.event }, { money: Number(r.money) });
  for (const e of search) for (const m of e.markets) if (m.active && !m.result) add("polymarket", { id: m.id, title: m.title, eventTitle: m.eventTitle, yesPrice: m.yesPrice }, { volume: m.volume24h ?? 0 });
  const top = [...seen.values()].filter(c => c.score >= 0.5).sort((a, b) => b.score - a.score || (b.volume + b.money) - (a.volume + a.money)).slice(0, 24);
  return chooseRanked(await foldPairs(db, top));
}

/** Kalshi markets matched to a Polymarket one fold into it (one choice: the Polymarket market, its volume and money
 *  added up); a Polymarket market with a Kalshi pair is marked paired. */
async function foldPairs(db: Db, list: Candidate[]): Promise<Candidate[]> {
  if (!list.length) return [];
  const ids = list.map(c => c.id);
  const r = await db.execute(sql`select data->'a'->>'venue' as av, data->'a'->>'id' as aid, data->'b'->>'venue' as bv, data->'b'->>'id' as bid
    from terminal.pairs where not blocked and (data->'a'->>'id' in (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) or data->'b'->>'id' in (${sql.join(ids.map(i => sql`${i}`), sql`, `)}))`);
  const polyOf = new Map<string, string>(), hasKalshi = new Set<string>();
  for (const p of r.rows as Array<{ av: string; aid: string; bv: string; bid: string }>) {
    const poly = p.av === "polymarket" ? p.aid : p.bv === "polymarket" ? p.bid : null, kal = p.av === "kalshi" ? p.aid : p.bv === "kalshi" ? p.bid : null;
    if (poly && kal) { polyOf.set(kal, poly); hasKalshi.add(poly); }
  }
  const out = new Map<string, Candidate>();
  for (const c of list) {
    const poly = c.venue === "kalshi" ? polyOf.get(c.id) : c.venue === "polymarket" ? c.id : undefined;
    const key = poly ? `p:${poly}` : c.key;
    const cur = out.get(key);
    const paired = Boolean(poly && hasKalshi.has(poly));
    if (!cur) { out.set(key, { ...c, key, paired, ...(poly && c.venue === "kalshi" ? { venue: "polymarket" as const, id: poly } : {}) }); continue; }
    // The Polymarket listing's own title wins; volumes and money add up across the pair.
    if (c.venue === "polymarket") Object.assign(cur, { title: c.title, event: c.event, yesPrice: c.yesPrice ?? cur.yesPrice });
    cur.score = Math.max(cur.score, c.score); cur.volume += c.volume; cur.money += c.money; cur.paired = cur.paired || paired;
  }
  return [...out.values()];
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
