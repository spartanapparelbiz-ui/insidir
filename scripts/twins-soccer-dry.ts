/* Dry run of soccer twinning for one Polymarket game slug: what the structured check says about each pair, nothing
 * saved. npx tsx scripts/twins-soccer-dry.ts ucl-slp-ars-2026-11-04 */
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { autoCheck, polySoccer, SOCCER_SERIES } from "@/lib/twins/structured";

async function main() {
  const slug = process.argv[2] ?? "ucl-slp-ars-2026-11-04";
  const poly = new PolymarketClient(), kalshi = new KalshiClient();
  const pe = await poly.getEventBySlug(slug);
  const g = polySoccer(slug);
  if (!pe || !g) { console.log("no Polymarket event or not soccer"); return; }
  const series = SOCCER_SERIES[g.league]!;
  const r = await fetch(`https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=${series}&limit=200`);
  const events = ((await r.json()) as { events: Array<{ event_ticker: string }> }).events.map(e => e.event_ticker);
  const d = new Date(`${g.date}T12:00:00Z`), code = `${String(d.getUTCFullYear()).slice(2)}${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}${String(d.getUTCDate()).padStart(2, "0")}`;
  for (const t of events.filter(e => e.includes(code))) {
    const ev = await kalshi.getEvent(t);
    for (const pm of pe.markets) for (const km of ev?.markets ?? []) {
      const a = autoCheck(pm, km);
      if (a.fields.event === "match") console.log(`${pm.title} ⇄ ${km.id} (${km.ids?.yesSub}): auto=${a.auto}`, JSON.stringify(a.fields));
    }
  }
}
void main();
