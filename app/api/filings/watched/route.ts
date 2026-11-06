/* GET /api/filings/watched?ciks=320193,1045810&since=<ms>: the member's watched companies' filings since a time, read
 * once on page load (and after a feed gap), never on every poll. At most 30 days back, 500 companies. */
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bad, filingsMember, privateJson } from "@/lib/filings/api";
import { watchedSince } from "@/lib/filings/store";

export const dynamic = "force-dynamic";
const MAX_BACK = 30 * 86_400_000;

export async function GET(req: NextRequest) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const ciks = [...new Set((req.nextUrl.searchParams.get("ciks") ?? "").split(",").map(s => s.trim()).filter(s => /^\d{1,10}$/.test(s)).map(s => String(Number(s))))];
  if (ciks.length > 500) return bad("Too many companies.");
  const now = Date.now();
  const since = Math.max(now - MAX_BACK, Number(req.nextUrl.searchParams.get("since")) || now - 7 * 86_400_000);
  return privateJson({ rows: await watchedSince(getDb(), ciks, since) });
}
