/* The ledger as CSV: the same rows the Receipts page shows for the same period and filters, under the same paywall
 * (lib/ledger.ts loadLedger). Every match, not just the first page. RFC 4180, UTF-8, downloaded as receipts.csv. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { loadLedger, toCsv } from "@/lib/ledger";
import { entitlements } from "@/lib/plans";
import { VENUE_NAME } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const ledger = await loadLedger(viewer.plan, viewer.region, params, Date.now());
  return new NextResponse(toCsv(ledger.rows, VENUE_NAME, entitlements(viewer.plan).sizesHidden), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="receipts.csv"',
      "cache-control": "no-store",
    },
  });
}
