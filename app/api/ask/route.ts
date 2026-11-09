/* POST /api/ask {question}: Ask Insidir (lib/ask/run.ts). Answers only from Insidir's data; "I don't have that." when
 * no tool has it. Members on live data, visitors 3 a day on 60-minute-late data with no open sides. */
import { NextResponse, type NextRequest } from "next/server";
import { askInsidir } from "@/lib/ask/run";
import { getViewer } from "@/lib/auth/viewer";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 300) : "";
  if (question.length < 3) return NextResponse.json({ error: "Ask a question about the markets, wallets or your bets." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ error: "Not available right now." }, { status: 503 });
  const viewer = await getViewer();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const r = await askInsidir(getDb(), { question, userId: viewer.user?.id ?? null, visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, member, now: Date.now() })
    .catch(e => { console.error("ask", e instanceof Error ? e.message : e); return null; });
  if (!r) return NextResponse.json({ error: "That didn't work. Try again in a moment." }, { status: 500 });
  if (!r.ok) return NextResponse.json({ error: member ? "That's a lot of questions for today. Try again tomorrow." : "That's today's free questions. Members ask as many as they like.", limit: true }, { status: 429 });
  return NextResponse.json({ answer: r.answer, remaining: r.remaining, member }, { headers: { "Cache-Control": "private, no-store" } });
}
