/* GET /api/explain?m=<market id> (members): "Explain this market", a few sentences on what Insidir's data shows about
 * one market (lib/analyst/market.ts). It explains, never recommends; off with AI_EXPLAIN=off. */
import { NextResponse, type NextRequest } from "next/server";
import { explainMarket, explainOn } from "@/lib/analyst/market";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!explainOn()) return NextResponse.json({ error: "Not available." }, { status: 404 });
  const viewer = await getViewer();
  if (!viewer.user || !isPaid(viewer.plan)) return NextResponse.json({ error: "Members only." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("m") ?? "";
  if (!/^[\w:.-]{3,120}$/.test(id) || !hasDatabase()) return NextResponse.json({ error: "No such market." }, { status: 400 });
  const e = await explainMarket(getDb(), id, Date.now()).catch(e => { console.error("explain", e instanceof Error ? e.message : e); return null; });
  if (!e || !e.text) return NextResponse.json({ error: "Nothing to explain on this market yet." }, { status: 404 });
  return NextResponse.json(e, { headers: { "Cache-Control": "private, max-age=300" } });
}
