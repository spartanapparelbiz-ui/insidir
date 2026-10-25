/* Kalshi P&L from the CSV the user downloads from their Kalshi account (the browser reads the file and posts its
 * text). Pro only. Nothing is stored; no API keys are ever asked for. */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { kalshiPnlFromCsv, MAX_CSV_CHARS } from "@/lib/pnl";
import { entitlements } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!entitlements(user.plan).pnl) return NextResponse.json({ error: "P&L comes with Insidir Pro." }, { status: 403 });
  const text = await req.text();
  if (text.length > MAX_CSV_CHARS) return NextResponse.json({ error: "That file is too large." }, { status: 413 });
  const { summary, error } = kalshiPnlFromCsv(text);
  if (!summary) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ summary }, { headers: { "Cache-Control": "private, no-store" } });
}
