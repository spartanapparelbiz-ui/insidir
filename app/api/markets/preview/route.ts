/* GET /api/markets/preview?kind=sports|markets|stocks|crypto: one home laptop's preview (lib/markets/preview.ts) for this
 * viewer. Visitors get 3 rows, 30 minutes late; members every row, live. The open panel re-reads it every 30 seconds. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isMarketKind, marketPreview } from "@/lib/markets/preview";
import { memo } from "@/lib/memo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  if (!isMarketKind(kind)) return NextResponse.json({ error: "Unknown market." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ error: "No data right now." }, { status: 503 });
  const viewer = await getViewer();
  const now = Date.now();
  const data = await memo(`preview:${kind}:${viewer.plan}:${viewer.region ?? ""}`, 15_000, () => marketPreview(getDb(), kind, viewer.plan, viewer.region, now));
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
