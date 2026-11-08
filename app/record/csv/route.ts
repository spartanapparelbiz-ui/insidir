/* GET /record/csv?<the page's filter>: the record's current filter as CSV, every row (not just the page shown).
 * Members only (signed in with a paid plan): it carries every open position's side. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";
import { readFilter, recordRows, toCsv } from "@/lib/record/query";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.user || !isPaid(viewer.plan)) return NextResponse.json({ error: "Members only." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "Not available." }, { status: 503 });
  const f = readFilter(Object.fromEntries(req.nextUrl.searchParams), Date.now());
  const rows = await recordRows(getDb(), f, { all: true });
  return new NextResponse(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="insidir-record-${f.from}-to-${f.to}.csv"`, "Cache-Control": "private, no-store" } });
}
