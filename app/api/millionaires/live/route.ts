/* GET /api/millionaires/live?n=5&cats=football,politics: the live counter and the newest millionaire bets
 * (lib/millionaires/queries.ts). Members live; everyone else VISITOR_DELAY_MS late (delayed: true). Wallets as tier
 * and short address; the full address only for members. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { isCategory } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { pulse, recentBets, VISITOR_DELAY_MS } from "@/lib/millionaires/queries";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const db = getDb(), now = Date.now();
  const member = isPaid((await getViewer()).plan);
  const n = Math.min(Math.max(Number(req.nextUrl.searchParams.get("n")) || 5, 1), 50);
  const cats = (req.nextUrl.searchParams.get("cats") ?? "").split(",").filter(isCategory);
  const [p, bets] = await Promise.all([pulse(db, now), recentBets(db, { now, delayMs: member ? 0 : VISITOR_DELAY_MS, limit: n, member, categories: cats })]);
  return NextResponse.json({ now, delayed: !member, pulse: p, bets }, { headers: { "Cache-Control": "no-store" } });
}
