/* GET /api/filings/feed?after=<id>: filings newer than the cursor, from one shared 10-second cache (lib/filings/store.ts).
 * Every member's 15-second poll hits the same cached rows; the browser keeps the ones on its watchlists. */
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { filingsMember, privateJson } from "@/lib/filings/api";
import { feedAfter } from "@/lib/filings/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const after = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("after") ?? 0)) || 0);
  return privateJson(await feedAfter(getDb(), after), { maxAge: 10 });
}
