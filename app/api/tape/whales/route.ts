/* GET /api/tape/whales: the whale ticker (lib/tape.ts whaleTicker), members only (it names the side). Re-read every
 * 15 seconds by components/system/WhaleTicker.tsx. */
import { NextResponse } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { whaleTicker } from "@/lib/tape";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!isPaid((await getViewer()).plan)) return NextResponse.json({ error: "members only" }, { status: 403 });
  const now = Date.now();
  return NextResponse.json({ now, rows: await whaleTicker(getDb(), { now }) }, { headers: { "Cache-Control": "no-store" } });
}
