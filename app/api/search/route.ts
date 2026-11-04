/* GET /api/search?q=: markets, races and wallets for the ⌘K search, or { go } when a pasted link names one market
 * (lib/search/search.ts). Public: titles and short addresses only, never a side. */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { search } from "@/lib/search/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ go: null, hits: [] }, { status: 503 });
  const r = await search(getDb(), req.nextUrl.searchParams.get("q") ?? "").catch(() => null);
  return r ? NextResponse.json(r, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ go: null, hits: [], error: "Search is unavailable. Try again." }, { status: 500 });
}
