/* A market's share card (1080×1350): the question, the Kalshi price when it has a twin, and the watchlist's money on
 * it. Never a side (a visitor's view), never a name. */
import { getDb, hasDatabase } from "@/lib/db";
import { marketHead, twinOf } from "@/lib/entities/market";
import { resolveMarketSlug } from "@/lib/entities/resolve";
import { dollars } from "@/lib/money";
import { entityOg, OG_PORTRAIT } from "@/lib/og/entity";

export const alt = "A market on Insidir";
export const size = OG_PORTRAIT;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const db = hasDatabase() ? getDb() : null;
  const ref = db ? await resolveMarketSlug(db, (await params).slug).catch(() => null) : null;
  const h = db && ref ? await marketHead(db, ref.id).catch(() => null) : null;
  const twin = db && ref ? (await twinOf(db, [ref.id]).catch(() => new Map())).get(ref.id) ?? null : null;
  return entityOg({ kicker: "Market", title: h?.title ?? ref?.title ?? "A market on Insidir",
    line: twin?.yes != null ? `On Kalshi now: ${Math.round(twin.yes * 100)}¢` : "Who's trading, live.",
    figure: h && h.total > 0 ? { value: dollars(h.total), label: `from ${h.wallets.toLocaleString("en-US")} ${h.wallets === 1 ? "wallet" : "wallets"} on the watchlist` } : null }, OG_PORTRAIT);
}
