/* PUT /api/filings/journal/<cik> {ticker, status, reason, notes, version}: saves the member's journal on one company.
 * 409 when another tab saved first (the browser reloads it). Status changes are appended to the history here. */
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bad, filingsMember, privateJson } from "@/lib/filings/api";
import { saveJournal } from "@/lib/filings/store";
import { CikParam, JournalBody } from "@/lib/filings/validate";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ cik: string }> }) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const cik = CikParam.safeParse((await ctx.params).cik);
  const body = JournalBody.safeParse(await req.json().catch(() => null));
  if (!cik.success || !body.success) return bad("That note couldn't be saved.");
  const saved = await saveJournal(getDb(), m.userId, cik.data, body.data.ticker, body.data);
  return saved ? privateJson({ journal: saved }) : privateJson({ error: "Edited in another tab. Reload to see the latest." }, { status: 409 });
}
