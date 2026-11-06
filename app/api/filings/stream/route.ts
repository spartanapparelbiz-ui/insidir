/* GET /api/filings/stream: the newest Cluster & Whale Stream matches, computed at ingestion and shared for 30 s. The
 * browser filters and sorts them. */
import { getDb } from "@/lib/db";
import { filingsMember, privateJson } from "@/lib/filings/api";
import { streamRows } from "@/lib/filings/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  return privateJson({ rows: await streamRows(getDb()) }, { maxAge: 30 });
}
