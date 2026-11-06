/* GET /api/filings/me: the member's lists, read cursor, accepted disclaimer version, positions and journal index. */
import { getDb } from "@/lib/db";
import { filingsMember, privateJson } from "@/lib/filings/api";
import { memberState } from "@/lib/filings/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  return privateJson(await memberState(getDb(), m.userId));
}
