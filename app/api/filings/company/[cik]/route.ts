/* GET /api/filings/company/<cik>: one company's filings and Stream matches (shared for 60 s) and the member's journal on
 * it. Used by the company report and each position's paper trail. */
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bad, filingsMember, privateJson } from "@/lib/filings/api";
import { companyRows, journalFor } from "@/lib/filings/store";
import { CikParam } from "@/lib/filings/validate";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ cik: string }> }) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const cik = CikParam.safeParse((await ctx.params).cik);
  if (!cik.success) return bad();
  const db = getDb();
  const [rows, journal] = await Promise.all([companyRows(db, cik.data), journalFor(db, m.userId, cik.data)]);
  return privateJson({ ...rows, journal });
}
