/* GET /api/tape?n=40&kinds=bet,exit,whale: the tape (lib/tape.ts), newest first. Members live with sides; visitors 60
 * minutes late, no side, outcome or price. Re-read every 10 seconds by components/system/Tape.tsx. */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { isTapeKind, tape } from "@/lib/tape";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const member = isPaid((await getViewer()).plan), now = Date.now();
  const n = Math.min(Math.max(Number(req.nextUrl.searchParams.get("n")) || 40, 1), 100);
  const kinds = (req.nextUrl.searchParams.get("kinds") ?? "").split(",").filter(isTapeKind);
  const rows = await tape(getDb(), { now, member, limit: n, kinds: kinds.length ? kinds : undefined });
  return NextResponse.json({ now, member, rows }, { headers: { "Cache-Control": "no-store" } });
}
