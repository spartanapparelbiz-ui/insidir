/* GET /api/desk/edge?bet=<id>: EdgeChart's data for one millionaire bet (lib/desk/edge.ts). Members only: it carries
 * the side and every entry. History is cached 5 minutes. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { edgeFor } from "@/lib/desk/edge";
import { PolymarketClient } from "@/lib/exchanges";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
let poly: PolymarketClient | null = null;

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!isPaid(viewer.plan)) return NextResponse.json({ error: "For members." }, { status: 401 });
  const bet = req.nextUrl.searchParams.get("bet");
  if (!bet || !hasDatabase()) return NextResponse.json({ error: "Which bet?" }, { status: 400 });
  const e = await edgeFor(getDb(), (poly ??= new PolymarketClient()), bet, Date.now()).catch(() => null);
  return e ? NextResponse.json(e, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
