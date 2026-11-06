/* PUT /api/filings/positions {positions, version}: the member's hand-logged positions, one document. 409 on a stale
 * version. Insidir never connects to a broker or a venue account. */
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bad, filingsMember, privateJson } from "@/lib/filings/api";
import { savePositions } from "@/lib/filings/store";
import { PositionsBody } from "@/lib/filings/validate";

export async function PUT(req: NextRequest) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const body = PositionsBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad("Positions couldn't be saved: check each one's fields.");
  const version = await savePositions(getDb(), m.userId, body.data.positions, body.data.version);
  return version === null ? privateJson({ error: "Edited in another tab. Reload to see the latest." }, { status: 409 }) : privateJson({ version });
}
