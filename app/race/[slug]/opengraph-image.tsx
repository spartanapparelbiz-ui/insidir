/* A race's share card (1080×1350): the race, the leader and its price, and the watchlist's money in it. */
import { getDb, hasDatabase } from "@/lib/db";
import { raceBySlug } from "@/lib/entities/race";
import { raceName } from "@/lib/market/races";
import { dollars } from "@/lib/money";
import { entityOg, OG_PORTRAIT } from "@/lib/og/entity";

export const alt = "A race on Insidir";
export const size = OG_PORTRAIT;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const r = hasDatabase() ? await raceBySlug(getDb(), (await params).slug, Date.now()).catch(() => null) : null;
  if (!r) return entityOg({ kicker: "Race", title: "A race on Insidir" }, OG_PORTRAIT);
  const lead = r.race.candidates.filter(c => c.price !== null).sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
  return entityOg({ kicker: "Race", title: raceName(r.race).replace(/^./, c => c.toUpperCase()), line: lead ? `${lead.name} at ${Math.round((lead.price ?? 0) * 100)}¢ on Polymarket` : null,
    figure: r.race.total > 0 ? { value: dollars(r.race.total), label: "from wallets up $100K+ this week" } : null }, OG_PORTRAIT);
}
