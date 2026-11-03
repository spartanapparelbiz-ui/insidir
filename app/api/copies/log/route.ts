/* POST /api/copies/log { betId, amount }: "I placed it" on a copy ticket (lib/copies/tickets.ts). Members only. The
 * ticket is rebuilt here (never trusted from the page), so the logged price is the one the member's region gets. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { logCopy, ticketFor } from "@/lib/copies/tickets";
import { getDb } from "@/lib/db";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.user || !isPaid(viewer.plan)) return NextResponse.json({ error: "Copying is for members." }, { status: 401 });
  const body = await req.json().catch(() => null) as { betId?: unknown; amount?: unknown } | null;
  if (!body || typeof body.betId !== "string") return NextResponse.json({ error: "Which bet?" }, { status: 400 });
  const db = getDb();
  const t = await ticketFor(db, body.betId, viewer.region);
  if (!t) return NextResponse.json({ error: "That bet isn't on the board." }, { status: 404 });
  const r = await logCopy(db, viewer.user.id, t, Number(body.amount));
  return r.ok ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ error: r.error }, { status: 409 });
}
