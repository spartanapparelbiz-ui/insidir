/* A bet's share card (1080×1350): the size and the market, the wallet's tier and all-time profit. Never the side (a
 * visitor's view), never a name. A bet under 60 minutes old shows nothing of it yet. */
import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { VISITOR_DELAY_MS } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { entityOg, OG_PORTRAIT } from "@/lib/og/entity";

export const alt = "A millionaire's trade on Insidir";
export const size = OG_PORTRAIT;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const r = hasDatabase() ? await getDb().execute(sql`select b.market_title, b.amount, b.tier, b.at, w.pnl from terminal.millionaire_bets b
    left join terminal.watchlist w on w.wallet = b.wallet where b.id = ${id} limit 1`).catch(() => null) : null;
  const b = r?.rows[0] as { market_title: string; amount: number; tier: string; at: Date | string; pnl: number | null } | undefined;
  if (!b || Date.now() - new Date(b.at).getTime() < VISITOR_DELAY_MS) return entityOg({ kicker: "Bet", title: "A millionaire's bet", line: "Who's trading on Kalshi. Kalshi won't show you." }, OG_PORTRAIT);
  const pnl = b.pnl === null ? null : Number(b.pnl);
  return entityOg({ kicker: b.tier === "millionaire" ? "Wallet up $1M+" : "Wallet up $100K+", title: `${dollars(Number(b.amount))} on ${b.market_title}`,
    line: pnl !== null ? `From a wallet ${pnl >= 0 ? "up" : "down"} ${dollars(Math.abs(pnl))} all-time. The side is for members.` : "The side is for members.",
    figure: { value: dollars(Number(b.amount)), label: "one trade" } }, OG_PORTRAIT);
}
