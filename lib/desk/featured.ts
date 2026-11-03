/* The Desk's data (lib/desk/data.ts) plus the featured bet (today's biggest that is still live: not decided) with its price history
 * (lib/desk/edge.ts). Server only. */
import type { Db } from "@/lib/db";
import { deskData, type Desk } from "@/lib/desk/data";
import { edgeFor, type Edge } from "@/lib/desk/edge";
import { PolymarketClient } from "@/lib/exchanges";
import { decision } from "@/lib/millionaires/decided";
import type { BoardBet } from "@/lib/millionaires/queries";

export interface Featured { bet: BoardBet; edge: Edge | null }
export interface DeskDesign extends Desk { featured: Featured[] }

let poly: PolymarketClient | null = null;

export async function deskDesign(db: Db, userId: string, settings: { alertPush?: boolean }, now: number): Promise<DeskDesign> {
  const d = await deskData(db, userId, settings, now, false);
  // One featured bet per market: the biggest live bet in each, biggest first.
  const seen = new Set<string>(), picks: BoardBet[] = [];
  for (const b of [...d.flow].filter(b => b.at >= now - 86_400_000 && !decision(b) && b.priceNow !== null).sort((a, b) => b.amount - a.amount)) {
    if (seen.has(b.marketId)) continue;
    seen.add(b.marketId); picks.push(b);
    if (picks.length === 3) break;
  }
  const edges = await Promise.all(picks.map(b => edgeFor(db, (poly ??= new PolymarketClient()), b.id, now).catch(() => null)));
  return { ...d, featured: picks.map((bet, i) => ({ bet, edge: edges[i] ?? null })) };
}
