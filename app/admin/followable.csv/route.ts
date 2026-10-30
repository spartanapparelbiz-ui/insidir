/* /admin/followable.csv (behind the admin sign-in): every tracker's old ROI (the traders' own return, from their entry
 * prices) next to its followable ROI ($100 at the price Insidir showed each position, plus a point of slippage), all
 * time and the last 30 days, with the settled counts, how far the seen-price backfill has got, and Positioning's
 * re-scored edge. The QA sheet for lib/follow. */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { getDb, hasDatabase } from "@/lib/db";
import { seenProgress } from "@/lib/follow/seen";
import { positioningEdge } from "@/lib/smart/gate";
import { TRACKERS, type TrackerRecord } from "@/lib/trackers";
import { trackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";

const roi = (r: TrackerRecord | undefined) => (r && r.staked ? ((r.net / r.staked) * 100).toFixed(2) : "");
const n = (r: TrackerRecord | undefined) => (r ? String(r.won + r.lost) : "0");
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function GET() {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now())) return new NextResponse("Sign in on /admin first.", { status: 401 });
  if (!hasDatabase()) return new NextResponse("No database.", { status: 503 });
  const db = getDb(), now = Date.now();
  const [stats, progress, edge] = await Promise.all([trackerStats(db, now), seenProgress(db), positioningEdge(db)]);
  const head = ["tracker", "name", "old_roi_pct_all", "old_settled_all", "followable_roi_pct_all", "followable_settled_all", "followable_net_per_100_all",
    "old_roi_pct_30d", "followable_roi_pct_30d", "followable_settled_30d"];
  const lines = [head.join(",")];
  for (const t of TRACKERS.filter(x => x.kind === "bets")) {
    const s = stats.get(t.slug);
    const f = s?.records.all, o = s?.own.all;
    lines.push([t.slug, t.name, roi(o), n(o), roi(f), n(f), f ? f.net.toFixed(2) : "", roi(s?.own["1m"]), roi(s?.records["1m"]), n(s?.records["1m"])].map(cell).join(","));
  }
  lines.push("", `# seen prices: ${progress.priced} priced, ${progress.none} without a price (left out), ${progress.left} still to backfill`);
  lines.push(`# positioning (re-scored): ${edge.scored} market calls, their side won ${edge.winRate === null ? "-" : (edge.winRate * 100).toFixed(1)}%, average side price ${edge.avgPrice === null ? "-" : (edge.avgPrice * 100).toFixed(1)}%, edge ${edge.edge === null ? "-" : (edge.edge * 100).toFixed(1)} pts`);
  return new NextResponse(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="followable-${new Date(now).toISOString().slice(0, 10)}.csv"` } });
}
