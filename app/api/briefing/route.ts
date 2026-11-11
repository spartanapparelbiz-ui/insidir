/* GET /api/briefing?m=<market id>[&side=yes|no]: the Bet Briefing for a market (lib/briefing), gated on the server:
 * members get every line, everyone else the first line of each section (side-neutral until it settles). */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { gateBriefing } from "@/lib/briefing/gate";
import { getBriefing, logTold } from "@/lib/briefing/store";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("m") ?? "";
  const s = req.nextUrl.searchParams.get("side");
  if (!/^[\w:.-]{3,120}$/.test(id) || !hasDatabase()) return NextResponse.json({ error: "No such market." }, { status: 400 });
  const viewer = await getViewer();
  const member = Boolean(viewer.user) && isPaid(viewer.plan);
  const side = member && (s === "yes" || s === "no") ? s : null;
  const db = getDb(), now = Date.now();
  const b = await getBriefing(db, id, now, { side }).catch(e => { console.error("briefing", e instanceof Error ? e.message : e); return null; });
  if (!b) return NextResponse.json({ error: "Insidir has no trades on this market yet." }, { status: 404 });
  if (member && viewer.user) await logTold(db, viewer.user.id, b, now).catch(() => undefined);
  return NextResponse.json(gateBriefing(b, member), { headers: { "Cache-Control": "private, max-age=60" } });
}
