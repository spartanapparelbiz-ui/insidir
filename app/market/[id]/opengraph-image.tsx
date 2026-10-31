/* A market's link preview (lib/og/entity.tsx): the question, its event, and the money in large positions on it. */
import { getDb, hasDatabase } from "@/lib/db";
import { dollars } from "@/lib/moves/copy";
import { listMoves, storedMarket } from "@/lib/moves/store";
import { entityOg, OG_SIZE } from "@/lib/og/entity";

export const alt = "A market on Insidir";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Visitors' delay: the preview never shows a position before the public pages do. */
const DELAY = 30 * 60_000;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const source = id.startsWith("0x") ? "polymarket" : "kalshi";
  const ok = /^[\w.\-:]{3,120}$/.test(id) && hasDatabase();
  const [m, moves] = ok ? await Promise.all([storedMarket(getDb(), source, id).catch(() => null), listMoves(getDb(), { marketId: id, until: Date.now() - DELAY, limit: 200 }).catch(() => [])]) : [null, []];
  const title = m?.title ?? moves[0]?.marketTitle ?? "A market on Insidir";
  const total = moves.reduce((a, x) => a + x.amount, 0);
  return entityOg({ kicker: source === "polymarket" ? "Polymarket" : "Kalshi", title, line: m?.eventTitle && m.eventTitle !== title ? m.eventTitle : null,
    figure: moves.length ? { value: dollars(total), label: `in ${moves.length.toLocaleString("en-US")} large ${moves.length === 1 ? "position" : "positions"}` } : null });
}
