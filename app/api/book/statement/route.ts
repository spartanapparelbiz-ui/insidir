/* GET /api/book/statement?month=YYYY-MM: the member's monthly statement as a PDF. Members only. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { isPaid } from "@/lib/plans";
import { bookFor } from "@/lib/book/book";
import { monthRange, statementPdf } from "@/lib/book/export";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.user || !isPaid(viewer.plan)) return NextResponse.json({ error: "The Book is for members." }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!monthRange(month)) return NextResponse.json({ error: "Which month? Use YYYY-MM." }, { status: 400 });
  const { entries } = await bookFor(getDb(), viewer.user.id);
  const pdf = await statementPdf({ month, email: viewer.user.email, entries, generatedAt: Date.now() });
  return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="insidir-statement-${month}.pdf"`, "cache-control": "no-store" } });
}
