/* Read-only: for tonight's NBA and NHL games and this week's NFL games, how many of each game's full-game moneyline,
 * spread and total markets on Polymarket have a Kalshi twin by the structured lookup (lib/twins/direct.ts). Writes
 * nothing.  npx tsx scripts/twins-coverage.ts [YYYY-MM-DD] */
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { gameTickers, pairByStructure } from "@/lib/twins/direct";
import type { VMarket } from "@/lib/types";

const TYPES: Record<string, string> = { moneyline: "moneyline", spreads: "spread", totals: "total" };

async function main() {
  const today = process.argv[2] ?? new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
  const week = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
  const poly = new PolymarketClient(), kalshi = new KalshiClient();
  const slugs: string[] = [];
  for (const tag of ["nba", "nhl", "nfl"]) {
    for (let off = 0; off < 1000; off += 100) {
      const r = await fetch(`https://gamma-api.polymarket.com/events?tag_slug=${tag}&closed=false&limit=100&offset=${off}`).then(x => x.json()).catch(() => []) as Array<{ slug?: string }>;
      if (!r.length) break;
      for (const e of r) {
        const m = /^(nba|nhl|nfl)-[a-z]+-[a-z]+-(\d{4}-\d{2}-\d{2})$/.exec(e.slug ?? "");
        if (!m) continue;
        if (m[1] === "nfl" ? m[2]! >= today && m[2]! <= week : m[2] === today) slugs.push(e.slug!);
      }
    }
  }
  const rows: string[] = [];
  const total = { poly: 0, twins: 0 };
  for (const slug of [...new Set(slugs)].sort()) {
    const pe = await poly.getEventBySlug(slug).catch(() => null);
    const full = (pe?.markets ?? []).filter(m => TYPES[m.ids?.sportsMarketType ?? ""]);
    let ticker: string | null = null, km: VMarket[] = [];
    for (const t of gameTickers(slug)) { const ev = await kalshi.getEvent(t).catch(() => null); if (ev?.markets.length) { ticker = t; km = [...ev.markets]; break; } }
    if (ticker) for (const type of ["SPREAD", "TOTAL"]) { const ev = await kalshi.getEvent(ticker.replace("GAME-", `${type}-`)).catch(() => null); if (ev) km.push(...ev.markets); }
    const pairs = pairByStructure(full, km);
    const by = (l: VMarket[], t: string) => l.filter(m => TYPES[m.ids?.sportsMarketType ?? ""] === t).length;
    const paired = pairs.map(p => p.poly);
    total.poly += full.length; total.twins += pairs.length;
    const cell = (t: string) => `${by(paired, t)}/${by(full, t)}`;
    rows.push(`| ${slug} | ${pe?.markets[0]?.title.split(":")[0] ?? ""} | ${ticker ?? "not on Kalshi"} | ${cell("moneyline")} | ${cell("spread")} | ${cell("total")} |`);
  }
  console.log(`| Game | Polymarket | Kalshi event | Moneyline | Spreads | Totals |\n|---|---|---|---|---|---|\n${rows.join("\n")}`);
  console.log(`\n${total.twins} of ${total.poly} full-game moneyline, spread and total markets have a Kalshi twin.`);
}
main().catch(e => { console.error(e); process.exit(1); });
