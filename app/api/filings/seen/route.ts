/* POST /api/filings/seen {id}: the member has read the feed up to this filing id (the cursor only moves forward). */
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bad, filingsMember, privateJson } from "@/lib/filings/api";
import { markSeen } from "@/lib/filings/store";
import { SeenBody } from "@/lib/filings/validate";

export async function POST(req: NextRequest) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const body = SeenBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad();
  await markSeen(getDb(), m.userId, body.data.id);
  return privateJson({ ok: true });
}
