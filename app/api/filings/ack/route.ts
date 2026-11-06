/* POST /api/filings/ack {version}: the member accepted the research disclaimer (lib/copy.ts RESEARCH_DISCLAIMER). */
import type { NextRequest } from "next/server";
import { RESEARCH_DISCLAIMER_V } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { bad, filingsMember, privateJson } from "@/lib/filings/api";
import { acknowledge } from "@/lib/filings/store";
import { AckBody } from "@/lib/filings/validate";

export async function POST(req: NextRequest) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const body = AckBody.safeParse(await req.json().catch(() => null));
  if (!body.success || body.data.version !== RESEARCH_DISCLAIMER_V) return bad();
  await acknowledge(getDb(), m.userId, body.data.version);
  return privateJson({ ok: true });
}
