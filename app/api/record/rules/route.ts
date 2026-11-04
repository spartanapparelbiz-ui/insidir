/* GET /api/record/rules: the rules report (lib/autopilot/report.ts): every starter rule and variant, backtested over
 * 180 days at Kalshi's ask + 1¢, losses included. Public: totals only, no bet, side or wallet. */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { autopilotBacktests } from "@/lib/db/schema";
import { REPORT_KEY } from "@/lib/autopilot/report";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ report: null }, { status: 503 });
  const r = (await getDb().select().from(autopilotBacktests).where(eq(autopilotBacktests.key, REPORT_KEY)).limit(1).catch(() => []))[0];
  if (!r) return NextResponse.json({ report: null, computedAt: null });
  const rep = r.result as unknown as { rows: Array<{ result: Record<string, unknown> }> };
  // Totals only: the curve stays private to members' rule pages.
  const rows = rep.rows.map(x => ({ ...x, result: { ...x.result, curve: undefined } }));
  return NextResponse.json({ report: { ...rep, rows }, computedAt: r.computedAt }, { headers: { "Cache-Control": "no-store" } });
}
