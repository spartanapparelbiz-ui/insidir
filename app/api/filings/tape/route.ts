/* GET /api/filings/tape?bucket=<n>&newest=<n>: one page of the full tape (every shown Form 4 and 8-K in an id bucket),
 * for the terminal's infinite scroll. Buckets below the newest never change, so the browser keeps them for a day and
 * the server for 10 minutes: scrolling back through thousands of filings reads shared, cached pages. */
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bad, filingsMember, privateJson } from "@/lib/filings/api";
import { tapeBucket } from "@/lib/filings/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const b = Number(req.nextUrl.searchParams.get("bucket")), newest = Number(req.nextUrl.searchParams.get("newest"));
  if (!Number.isInteger(b) || b < 0 || !Number.isInteger(newest) || newest < b) return bad();
  const isNewest = b === newest;
  return privateJson({ bucket: b, rows: await tapeBucket(getDb(), b, isNewest) }, { maxAge: isNewest ? 10 : 86_400 });
}
