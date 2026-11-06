/* GET /api/filings/tickers: the SEC ticker directory as [ticker, cik, title] triples. Public data, the same for everyone:
 * cached by browsers and any CDN for an hour, so ticker search runs in the browser with no request per keystroke. */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tickerList } from "@/lib/filings/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await tickerList(getDb()).catch(() => [] as Array<[string, string, string]>);
  return NextResponse.json({ rows }, { headers: { "Cache-Control": rows.length ? "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" : "no-store" } });
}
