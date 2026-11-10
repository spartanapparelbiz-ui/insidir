/* GET /api/millionaires/live?n=8&cats=football,politics: the live counter and the newest millionaire bets
 * (lib/millionaires/queries.ts), live for everyone. Visitors get each bet without its side (removed on the server,
 * never sent); members get the side and the full wallet address (to follow). With board=1 (/board), visitors get the
 * bets 60 minutes late (the live count stays live); members always live. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { isCategory } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { BOARD_DELAY_MS, pulse, recentBets } from "@/lib/millionaires/queries";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const db = getDb(), now = Date.now();
  const member = isPaid((await getViewer()).plan);
  const n = Math.min(Math.max(Number(req.nextUrl.searchParams.get("n")) || 5, 1), 50);
  const cats = (req.nextUrl.searchParams.get("cats") ?? "").split(",").filter(isCategory);
  const delayMs = !member && req.nextUrl.searchParams.get("board") === "1" ? BOARD_DELAY_MS : 0;
  // tier=all: every watched wallet up $100K+ (the board's default); tier=pro: $100K–$1M only; otherwise $1M+ only.
  const t = req.nextUrl.searchParams.get("tier");
  const tier = t === "pro" ? "pro" as const : t === "all" ? undefined : "millionaire" as const;
  const [p, bets] = await Promise.all([pulse(db, now, cats.length === 1 ? cats[0] : null), recentBets(db, { now, limit: n, member, categories: cats, delayMs, tier })]);
  return NextResponse.json({ now, member, pulse: p, bets }, { headers: { "Cache-Control": "no-store" } });
}
