/* POST /api/research {q, wallet?}: one Research question (lib/research/ask.ts). Visitors: 3 a day, 30 minutes late;
 * members: live, fair use. The answer is 1–2 sentences and the rows as tables. */
import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { movePlan } from "@/lib/moves/gate";
import { isPaid } from "@/lib/plans";
import { ask, VISITOR_DAILY } from "@/lib/research/ask";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { q?: unknown; wallet?: unknown } | null;
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 300) : "";
  if (q.length < 3) return NextResponse.json({ error: "Ask a question about Insidir's data." }, { status: 400 });
  const wallet = typeof body?.wallet === "string" && /^0x[0-9a-f]{40}$/i.test(body.wallet) ? body.wallet.toLowerCase() : null;
  if (!hasDatabase()) return NextResponse.json({ error: "Research is catching up. Try again in a minute." }, { status: 503 });
  const viewer = await getViewer();
  const now = Date.now(), delay = movePlan(viewer.plan).delayMs;
  const r = await ask(getDb(), { question: q, userId: viewer.user?.id ?? null, visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, member: isPaid(viewer.plan), live: delay === 0, until: now - delay, now, wallet });
  if (!r.ok) return NextResponse.json({ error: `Visitors get ${VISITOR_DAILY} questions a day. Members ask as many as they like, on live data.`, limit: true }, { status: 429 });
  return NextResponse.json({ id: r.id, answer: r.answer, cached: r.cached, remaining: r.remaining, member: isPaid(viewer.plan) }, { headers: { "Cache-Control": "private, no-store" } });
}
