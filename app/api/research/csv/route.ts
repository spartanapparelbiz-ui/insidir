/* GET /api/research/csv?id=<question id>: a member's Research answer as CSV (their own questions only). */
import { NextResponse, type NextRequest } from "next/server";
import { memberOrNull } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { MEMBERS_ONLY } from "@/lib/copy";
import { answerById, answerCsv } from "@/lib/research/ask";

export async function GET(req: NextRequest) {
  const viewer = await memberOrNull();
  if (!viewer?.user) return NextResponse.json({ error: MEMBERS_ONLY }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  const a = Number.isInteger(id) && id > 0 ? await answerById(getDb(), id, viewer.user.id) : null;
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(answerCsv(a), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="insidir-research-${id}.csv"`, "Cache-Control": "private, no-store" } });
}
