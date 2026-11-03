/* GET /api/millionaires/election: the Election Day board (lib/brand/pulse.ts electionBoard), refreshed by the landing
 * every minute (and /election). Visitors get the top 3 races whole and the rest by title and total only; members all. */
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { electionBoard } from "@/lib/brand/pulse";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = Date.now();
  if (!hasDatabase()) return NextResponse.json({ at: now, free: [], locked: [], off: true }, { headers: { "Cache-Control": "no-store" } });
  const viewer = await getViewer();
  const board = await electionBoard(getDb(), now, isPaid(viewer.plan)).catch(() => null);
  if (!board) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
}
