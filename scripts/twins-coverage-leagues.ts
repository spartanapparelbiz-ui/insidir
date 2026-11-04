/* Read-only Kalshi coverage by league: for each league's Polymarket games in the next week, how many have every
 * moneyline market (each side, and the draw in soccer) twinned on Kalshi by the structured check. Writes nothing.
 * npx tsx scripts/twins-coverage-leagues.ts > qa/twins-coverage-leagues.md */
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { gameTickers, pairByStructure } from "@/lib/twins/direct";
import { autoCheck, polySoccer, SOCCER_SERIES } from "@/lib/twins/structured";
import type { VMarket } from "@/lib/types";

const LEAGUES: Array<{ name: string; tag: string; prefix: string }> = [
  { name: "NBA", tag: "nba", prefix: "nba" }, { name: "NHL", tag: "nhl", prefix: "nhl" }, { name: "NFL", tag: "nfl", prefix: "nfl" },
  { name: "Champions League", tag: "ucl", prefix: "ucl" }, { name: "Europa League", tag: "uel", prefix: "uel" }, { name: "Premier League", tag: "premier-league", prefix: "epl" },
  { name: "La Liga", tag: "la-liga", prefix: "lal" }, { name: "Bundesliga", tag: "bundesliga", prefix: "bun" }, { name: "Ligue 1", tag: "ligue-1", prefix: "fl1" },
  { name: "Serie A", tag: "serie-a", prefix: "sea" }, { name: "MLS", tag: "mls", prefix: "mls" },
];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const series = new Map<string, string[]>();

async function seriesEvents(s: string): Promise<string[]> {
  if (series.has(s)) return series.get(s)!;
  const out: string[] = [];
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const j = await fetch(`https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=${s}&limit=200${cursor ? `&cursor=${cursor}` : ""}`).then(r => r.json()).catch(() => null) as { events?: Array<{ event_ticker: string }>; cursor?: string } | null;
    out.push(...(j?.events ?? []).map(e => e.event_ticker));
    if (!j?.cursor) break;
    cursor = j.cursor;
  }
  series.set(s, out);
  return out;
}

async function main() {
  const today = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
  const end = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
  const poly = new PolymarketClient(), kalshi = new KalshiClient();
  const rows: string[] = [], misses: string[] = [];
  for (const L of LEAGUES) {
    const slugs = new Set<string>();
    for (let off = 0; off < 600; off += 100) {
      const r = await fetch(`https://gamma-api.polymarket.com/events?tag_slug=${L.tag}&closed=false&limit=100&offset=${off}`).then(x => x.json()).catch(() => []) as Array<{ slug?: string }>;
      if (!r.length) break;
      for (const e of r) { const m = new RegExp(`^${L.prefix}-[a-z0-9]+-[a-z0-9]+-(\\d{4}-\\d{2}-\\d{2})$`).exec(e.slug ?? ""); if (m && m[1]! >= today && m[1]! <= end) slugs.add(e.slug!); }
    }
    let games = 0, listed = 0, full = 0, ml = 0, mlTwins = 0;
    for (const slug of [...slugs].sort()) {
      const pe = await poly.getEventBySlug(slug).catch(() => null);
      const lines = (pe?.markets ?? []).filter(m => m.ids?.sportsMarketType === "moneyline");
      if (!lines.length) continue;
      games++;
      let km: VMarket[] = [];
      if (polySoccer(slug)) {
        const g = polySoccer(slug)!, s = SOCCER_SERIES[g.league]!, d = Date.parse(`${g.date}T12:00:00Z`);
        const codes = [d, d - 86_400_000].map(x => { const t = new Date(x); return `${s}-${String(t.getUTCFullYear()).slice(2)}${MON[t.getUTCMonth()]}${String(t.getUTCDate()).padStart(2, "0")}`; });
        for (const t of (await seriesEvents(s)).filter(e => codes.some(c => e.startsWith(c)))) km.push(...((await kalshi.getEvent(t).catch(() => null))?.markets ?? []));
      } else for (const t of gameTickers(slug)) { const ev = await kalshi.getEvent(t).catch(() => null); if (ev?.markets.length) { km = [...ev.markets]; break; } }
      const pairs = pairByStructure(lines, km);
      // Kalshi lists games a few days ahead: a game it doesn't list yet isn't a miss.
      const onKalshi = km.some(k => autoCheck(lines[0]!, k).fields.event === "match");
      if (!onKalshi) continue;
      listed++;
      ml += lines.length; mlTwins += pairs.length;
      if (pairs.length === lines.length) full++; else misses.push(`${L.name}: ${slug} (${pairs.length}/${lines.length})`);
    }
    rows.push(`| ${L.name} | ${games} | ${listed} | ${full} | ${listed ? Math.round((full / listed) * 100) : 0}% | ${mlTwins}/${ml} |`);
  }
  console.log(`# Kalshi coverage by league, ${today} to ${end}\n\nPolymarket games in the next week. Kalshi lists games a few days ahead, so coverage counts the games Kalshi lists now: a game is covered when every moneyline market (each side, and the draw in soccer) has a Kalshi twin by the structured check.\n`);
  console.log(`| League | Polymarket games | On Kalshi now | Fully twinned | Coverage | Moneyline markets twinned |\n|---|---|---|---|---|---|\n${rows.join("\n")}`);
  if (misses.length) console.log(`\n## Not fully twinned\n\n${misses.map(m => `- ${m}`).join("\n")}`);
}
main().catch(e => { console.error(e); process.exit(1); });
