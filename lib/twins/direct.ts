/* Twins for the games millionaires actually bet on, found directly instead of from the live sweep. The sweep
 * (lib/twins/store.ts buildTwins) only sees markets both venues list as open right now, so a game that already started,
 * closed or settled (e.g. Suns vs. Warriors on Nov 2) never got a twin. Here every sports market with a millionaire bet
 * in the last 14 days goes from its Polymarket event slug ("nba-phx-gsw-2026-11-02") straight to Kalshi's event tickers
 * for that game (KXNBAGAME-26NOV02PHXGSW, then …SPREAD- and …TOTAL- with the same teams), and each of the event's
 * markets is paired by the same structured check (lib/twins/structured.ts autoCheck: all five fields, never a title).
 * A Polymarket market is twinned only when exactly one Kalshi market passes. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { VMarket } from "@/lib/types";
import { TEAMS, type League } from "@/lib/matching/aliases";
import { pairByStructure, polySoccer, SOCCER_SERIES } from "./structured";
import { memo } from "@/lib/memo";
import { saveTwin } from "./store";
export { pairByStructure } from "./structured";

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY = 86_400_000;

/** Every way Kalshi might write a game's GAME event ticker: both team orders, each team's known codes.
 *  "nba-phx-gsw-2026-11-02" → ["KXNBAGAME-26NOV02PHXGSW", "KXNBAGAME-26NOV02GSWPHX", …]. Pure. */
export function gameTickers(slug: string): string[] {
  const m = /^(nba|nfl|mlb|nhl)-([a-z]{2,4})-([a-z]{2,4})-(\d{4})-(\d{2})-(\d{2})$/.exec(slug);
  if (!m) return [];
  const league = m[1] as League;
  const codes = (c: string) => {
    const row = TEAMS[league].find(r => r.abbr.includes(c.toUpperCase()));
    return row ? [c.toUpperCase(), ...row.abbr.filter(a => a !== c.toUpperCase())] : [c.toUpperCase()];
  };
  // The slug's date, then the day before (Polymarket sometimes dates a late game by UTC; Kalshi by US Eastern time).
  const day = Date.UTC(Number(m[4]), Number(m[5]) - 1, Number(m[6]));
  const out: string[] = [];
  for (const d of [day, day - DAY]) {
    const x = new Date(d), head = `KX${league.toUpperCase()}GAME-${String(x.getUTCFullYear()).slice(2)}${MON[x.getUTCMonth()]}${String(x.getUTCDate()).padStart(2, "0")}`;
    for (const a of codes(m[2]!)) for (const b of codes(m[3]!)) out.push(`${head}${a}${b}`, `${head}${b}${a}`);
  }
  return [...new Set(out)];
}

interface DirectClients {
  polymarket: { getEventBySlug(slug: string): Promise<{ markets: VMarket[] } | null> };
  kalshi: { getEvent(ticker: string): Promise<{ markets: VMarket[] } | null> };
}

/** Event slugs of the Polymarket markets these condition ids belong to (open or closed). */
async function slugsOf(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40), q = chunk.map(id => `condition_ids=${id}`).join("&");
    for (const closed of ["false", "true"]) {
      const r = await fetch(`https://gamma-api.polymarket.com/markets?${q}&closed=${closed}&limit=${chunk.length}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      const list = r?.ok ? ((await r.json().catch(() => [])) as Array<{ conditionId?: string; events?: Array<{ slug?: string }> }>) : [];
      for (const m of list) if (m.conditionId && m.events?.[0]?.slug) out.set(m.conditionId, m.events[0].slug);
    }
  }
  return out;
}

const noGame = new Map<string, number>(); // slug → when Kalshi had no such game (looked up again after 6 hours)

/** Twins for the games with millionaire bets in the last 14 days that don't have an approved or decided twin yet. */
export async function twinsFromBets(db: Db, c: DirectClients, now: number, maxEvents = 30): Promise<{ events: number; twins: number; auto: number }> {
  const rows = (await db.execute(sql`select distinct b.market_id from terminal.millionaire_bets b
      where b.source = 'polymarket' and b.at > ${new Date(now - 14 * DAY)}
        and not exists (select 1 from terminal.market_twins t where t.polymarket_id = b.market_id and (t.status <> 'pending' or t.decided_by is not null))`)).rows as Array<{ market_id: string }>;
  const slugs = await slugsOf(rows.map(r => r.market_id).filter(id => /^0x[0-9a-f]{64}$/i.test(id)));
  const games = [...new Set(slugs.values())].filter(s => (gameTickers(s).length || polySoccer(s)) && (noGame.get(s) ?? 0) < now - 6 * 3_600_000).slice(0, maxEvents);
  const counts = { events: 0, twins: 0, auto: 0 };
  for (const slug of games) {
    const r = await twinGame(db, c, slug, now);
    if (r === null) { noGame.set(slug, now); continue; }
    counts.events++; counts.twins += r.twins; counts.auto += r.auto;
  }
  return counts;
}

/** One game's twins: its Polymarket markets against Kalshi's GAME, SPREAD and TOTAL events for it. Null when Kalshi
 *  has no such game (or Polymarket no such event). */
async function twinGame(db: Db, c: DirectClients, slug: string, now: number): Promise<{ twins: number; auto: number } | null> {
  const pe = await c.polymarket.getEventBySlug(slug).catch(() => null);
  if (!pe?.markets.length) return null;
  if (polySoccer(slug)) return soccerGame(db, c, slug, pe.markets, now);
  let game: { ticker: string; markets: VMarket[] } | null = null;
  for (const t of gameTickers(slug)) {
    const ev = await c.kalshi.getEvent(t).catch(() => null);
    if (ev?.markets.length) { game = { ticker: t, markets: ev.markets }; break; }
  }
  if (!game) return null;
  const kalshi = [...game.markets];
  for (const type of ["SPREAD", "TOTAL"]) {
    const ev = await c.kalshi.getEvent(game.ticker.replace(/GAME-/, `${type}-`)).catch(() => null);
    if (ev) kalshi.push(...ev.markets);
  }
  const out = { twins: 0, auto: 0 };
  for (const t of pairByStructure(pe.markets, kalshi)) {
    out.twins++;
    if (await saveTwin(db, t, now)) out.auto++;
  }
  return out;
}

/** A soccer game's twins. Kalshi's club codes aren't Polymarket's ("SLA" vs "slp"), so the game is found among the
 *  league's Kalshi events on that date (or the day before), and the structured check pairs the clubs by name. */
async function soccerGame(db: Db, c: DirectClients, slug: string, poly: readonly VMarket[], now: number): Promise<{ twins: number; auto: number } | null> {
  const g = polySoccer(slug)!, series = SOCCER_SERIES[g.league]!;
  const day = Date.parse(`${g.date}T12:00:00Z`);
  const codes = [day, day - DAY].map(d => { const x = new Date(d); return `${String(x.getUTCFullYear()).slice(2)}${MON[x.getUTCMonth()]}${String(x.getUTCDate()).padStart(2, "0")}`; });
  const tickers = (await seriesEvents(series)).filter(t => codes.some(code => t.startsWith(`${series}-${code}`)));
  const out = { twins: 0, auto: 0 };
  let found = false;
  for (const t of tickers) {
    const ev = await c.kalshi.getEvent(t).catch(() => null);
    if (!ev?.markets.length) continue;
    const pairs = pairByStructure(poly, ev.markets);
    if (!pairs.length) continue;
    found = true;
    for (const p of pairs) { out.twins++; if (await saveTwin(db, p, now)) out.auto++; }
  }
  return found ? out : null;
}

/** Every event ticker in a Kalshi series (open and settled), cached 30 minutes. */
function seriesEvents(series: string): Promise<string[]> {
  return memo(`kalshi:series-events:${series}`, 30 * 60_000, async () => {
    const out: string[] = [];
    let cursor = "";
    for (let page = 0; page < 20; page++) {
      const r = await fetch(`https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=${series}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
      const j = r?.ok ? ((await r.json().catch(() => null)) as { events?: Array<{ event_ticker: string }>; cursor?: string } | null) : null;
      for (const e of j?.events ?? []) out.push(e.event_ticker);
      if (!j?.cursor) break;
      cursor = j.cursor;
    }
    return out;
  });
}

/** Twins for the games behind the last 180 days of recorded big bets (terminal.moves), each game looked up once
 *  (terminal.twin_attempts): what lets the record be priced on Kalshi. */
export async function twinsFromHistory(db: Db, c: DirectClients, now: number, maxEvents = 20): Promise<{ events: number; twins: number; auto: number; left: number }> {
  const rows = (await db.execute(sql`select distinct m.market_id from terminal.moves m
      where m.source = 'polymarket' and m.at > ${new Date(now - 180 * DAY)} and m.seen_price is not null
        and not exists (select 1 from terminal.market_twins t where t.polymarket_id = m.market_id)
      limit 400`)).rows as Array<{ market_id: string }>;
  const slugs = await slugsOf(rows.map(r => r.market_id).filter(id => /^0x[0-9a-f]{64}$/i.test(id)));
  const tried = new Set(((await db.execute(sql`select slug from terminal.twin_attempts`)).rows as Array<{ slug: string }>).map(r => r.slug));
  const all = [...new Set(slugs.values())].filter(s => (gameTickers(s).length || polySoccer(s)) && !tried.has(s));
  const counts = { events: 0, twins: 0, auto: 0, left: Math.max(0, all.length - maxEvents) };
  for (const slug of all.slice(0, maxEvents)) {
    const r = await twinGame(db, c, slug, now);
    await db.execute(sql`insert into terminal.twin_attempts (slug, found, at) values (${slug}, ${r !== null}, ${new Date(now)}) on conflict (slug) do update set found = excluded.found, at = excluded.at`);
    if (!r) continue;
    counts.events++; counts.twins += r.twins; counts.auto += r.auto;
  }
  return counts;
}
