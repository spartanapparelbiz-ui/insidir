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
import { pairByStructure } from "./structured";
import { saveTwin } from "./store";
export { pairByStructure, structuredResult } from "./structured";

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

export interface DirectClients {
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
  const games = [...new Set(slugs.values())].filter(s => gameTickers(s).length && (noGame.get(s) ?? 0) < now - 6 * 3_600_000).slice(0, maxEvents);
  const counts = { events: 0, twins: 0, auto: 0 };
  for (const slug of games) {
    const pe = await c.polymarket.getEventBySlug(slug).catch(() => null);
    if (!pe?.markets.length) continue;
    let game: { ticker: string; markets: VMarket[] } | null = null;
    for (const t of gameTickers(slug)) {
      const ev = await c.kalshi.getEvent(t).catch(() => null);
      if (ev?.markets.length) { game = { ticker: t, markets: ev.markets }; break; }
    }
    if (!game) { noGame.set(slug, now); continue; }
    counts.events++;
    const kalshi = [...game.markets];
    for (const type of ["SPREAD", "TOTAL"]) {
      const ev = await c.kalshi.getEvent(game.ticker.replace(/GAME-/, `${type}-`)).catch(() => null);
      if (ev) kalshi.push(...ev.markets);
    }
    for (const t of pairByStructure(pe.markets, kalshi)) {
      counts.twins++;
      if (await saveTwin(db, t, now)) counts.auto++;
    }
  }
  return counts;
}
