/* GET /api/filings/export: everything the member wrote (lists, journals with notes and status history, positions) as
 * one JSON file. Their research is theirs to keep (docs/RESEARCH-DESK.md §10). */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { filingsMember } from "@/lib/filings/api";
import { exportAll } from "@/lib/filings/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const data = await exportAll(getDb(), m.userId);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="insidir-research-${new Date().toISOString().slice(0, 10)}.json"`,
  } });
}
