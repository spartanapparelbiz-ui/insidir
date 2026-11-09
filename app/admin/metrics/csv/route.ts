/* GET /admin/metrics/csv: the /admin/metrics view (same window and grouping) as CSV. Owner only (the admin sign-in). */
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { getDb, hasDatabase } from "@/lib/db";
import { metricsCsv, metricsRows, metricsTotals, readWindow } from "@/lib/metrics/report";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifyAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value, Date.now())) return NextResponse.json({ error: "Sign in on /admin first." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "No database." }, { status: 503 });
  const now = Date.now(), q = Object.fromEntries(req.nextUrl.searchParams);
  const w = readWindow(q, now), by = q.by === "post" ? "post" : "source";
  const db = getDb();
  const rows = await metricsRows(db, w, by, now);
  const total = await metricsTotals(db, w, rows, now);
  return new NextResponse(metricsCsv(rows, total, w, by), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="insidir-metrics-${by}-${w.from}-to-${w.to}.csv"`, "cache-control": "private, no-store" },
  });
}
