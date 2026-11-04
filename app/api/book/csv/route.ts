/* GET /api/book/csv: the member's whole Book as CSV. Members only. */
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { isPaid } from "@/lib/plans";
import { bookFor } from "@/lib/book/book";
import { bookCsv } from "@/lib/book/export";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer.user || !isPaid(viewer.plan)) return NextResponse.json({ error: "The Book is for members." }, { status: 401 });
  const { entries } = await bookFor(getDb(), viewer.user.id);
  return new NextResponse(bookCsv(entries), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="insidir-book.csv"', "cache-control": "no-store" } });
}
