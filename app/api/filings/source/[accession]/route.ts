/* GET /api/filings/source/<accession>: a Form 4's ownership XML as filed, for the source drawer (lib/filings/source.ts).
 * Fetched from EDGAR on first open and cached; immutable, so the browser keeps it for a day. Needs SEC_USER_AGENT on the
 * web service; without it the drawer shows the parsed lines and the sec.gov link only. */
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { filingsMember, privateJson } from "@/lib/filings/api";
import { sourceFor } from "@/lib/filings/source";

export const dynamic = "force-dynamic";
const MESSAGES = { "not-found": "No such filing.", "no-xml": "This filing has no ownership XML. Open it on sec.gov.", unavailable: "Source documents aren't available right now. Open it on sec.gov." } as const;
const STATUS = { "not-found": 404, "no-xml": 404, unavailable: 503 } as const;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ accession: string }> }) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const r = await sourceFor(getDb(), (await ctx.params).accession).catch(() => "unavailable" as const);
  if (typeof r === "string") return privateJson({ error: MESSAGES[r] }, { status: STATUS[r] });
  return privateJson(r, { maxAge: 86_400 });
}
