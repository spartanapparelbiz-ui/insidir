/* GET /api/go?cats=football,elections: the /go funnel's live data for these categories (lib/go/data.ts). Unpaid
 * visitors get the hook bet without its side and two of the three markets with their money merged into one total;
 * after paying (signed in, or a membership linked to this visitor id by the billing webhook) everything is whole. */
import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { goData, paidByVisitor, parseCats } from "@/lib/go/data";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const db = getDb(), now = Date.now();
  const paid = isPaid((await getViewer()).plan) || (await paidByVisitor(db, req.cookies.get(VISITOR_COOKIE)?.value ?? null));
  return NextResponse.json(await goData(db, parseCats(req.nextUrl.searchParams.get("cats")), now, paid), { headers: { "Cache-Control": "no-store" } });
}
