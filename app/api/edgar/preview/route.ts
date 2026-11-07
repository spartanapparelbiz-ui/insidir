/* GET /api/edgar/preview: the /edgar landing's live table (lib/filings/preview.ts), public. Computed at most once every
 * 30 s per server instance and marked cacheable by any CDN in front of the site, so a visitor's refresh costs no
 * database read. Off (404) until FEATURES_READY has "filings". */
import { NextResponse } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { EMPTY_PREVIEW, previewFor } from "@/lib/filings/preview";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isReady("filings")) return NextResponse.json({ error: "Not available." }, { status: 404 });
  const data = hasDatabase() ? await previewFor(getDb()).catch(() => EMPTY_PREVIEW(Date.now())) : EMPTY_PREVIEW(Date.now());
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120" } });
}
