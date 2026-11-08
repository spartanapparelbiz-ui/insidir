/* GET /verify/pm/<market id>: Verify's "Polymarket" link. The Polymarket URL never leaves the server (a US user never
 * gets a Polymarket link, payloads included), so the link is this route: outside the US it redirects to the market's
 * Polymarket page; in the US, or when the region isn't known yet, to the same market on Kalshi when Kalshi lists it,
 * else to the market's page on Insidir. */
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { appUrl } from "@/lib/app-url";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { marketPath } from "@/lib/entities/slug";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  if (!/^[\w:.-]{3,120}$/.test(market) || !hasDatabase()) return new NextResponse("Not found", { status: 404 });
  const [viewer, row] = await Promise.all([
    getViewer(),
    getDb().execute(sql`select x.url, x.market_title, coalesce(tw.kalshi_url, x.kalshi_url) as kalshi from (
        select url, market_title, kalshi_url, at from terminal.millionaire_bets where market_id = ${market}
        union all select market_url, market_title, kalshi_url, flagged_at from terminal.record_log where market_id = ${market}) x
      left join terminal.market_twins tw on tw.polymarket_id = ${market} and tw.status = 'approved'
      order by x.url is null, x.at desc limit 1`).then(r => r.rows[0] as { url: string | null; market_title: string; kalshi: string | null } | undefined),
  ]);
  if (!row) return new NextResponse("Not found", { status: 404 });
  const to = viewer.region === "non_us" && row.url ? row.url : row.kalshi ?? `${appUrl()}${marketPath(market, row.market_title)}`;
  return NextResponse.redirect(to, 302);
}
