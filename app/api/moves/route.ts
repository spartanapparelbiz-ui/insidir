/* GET /api/moves?tab=sports|markets&min=10000&league=NFL&before=<ms>&limit=30&all=1&tracker=fed-rates
 * GET /api/moves?best=24h  the largest position of the last 24 hours (as this viewer sees them: visitors 30 minutes
 * late) whose headline reads cleanly (no quoted question, no "Yes on"), for the pay prompt.
 * all=1 keeps the low-interest markets the default feed leaves out; tracker narrows to one tracker's moves.
 * The feed, gated by plan and region on the server (lib/moves/feed.ts). A tab that isn't live (Crypto; Stocks until
 * it is in FEATURES_READY) returns an empty list. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { feedFor, feedStatus } from "@/lib/moves/feed";
import { cleanHeadline } from "@/lib/moves/headline";
import { LEAGUES, type League, type Tab } from "@/lib/moves/types";
import { liveTabs } from "@/lib/features";

export const dynamic = "force-dynamic";



export async function GET(req: NextRequest) {
  const now = Date.now();
  const p = req.nextUrl.searchParams;
  const tab = p.get("tab") as Tab | null;
  if (tab && !liveTabs().includes(tab)) return NextResponse.json({ items: [], status: null, comingSoon: true });
  const league = p.get("league") as League | null;
  const leagues = (p.get("leagues") ?? "").split(",").filter((l): l is League => (LEAGUES as readonly string[]).includes(l));
  const categories = (p.get("cats") ?? "").split(",").filter(c => /^[a-z]{2,20}$/.test(c)).slice(0, 10);
  const min = Math.max(0, Number(p.get("min")) || 0);
  const before = Number(p.get("before")) || undefined;
  const limit = Math.min(50, Math.max(1, Number(p.get("limit")) || 30));
  const all = p.get("all") === "1";
  const tracker = /^[a-z0-9-]{2,40}$/.test(p.get("tracker") ?? "") ? p.get("tracker") : null;
  if (!hasDatabase()) return NextResponse.json({ items: [], status: { state: "behind", lastAt: null, text: "Catching up · waiting for the first update" } });
  // Visitors get the 30-minute-delayed view (the plan gates every row); members get it live.
  const viewer = await getViewer();
  const db = getDb();
  if (p.get("best") === "24h") {
    const list = await feedFor(db, viewer.plan, viewer.region, { min: 10_000, limit: 50 }, now);
    const best = list.filter(m => m.at > now - 86_400_000 && cleanHeadline(m.headline)).sort((a, b) => b.amount - a.amount)[0];
    return NextResponse.json({ items: best ? [best] : [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const [items, status] = await Promise.all([
    feedFor(db, viewer.plan, viewer.region, { tab: tab ?? undefined, min, league: league && LEAGUES.includes(league) ? league : undefined, leagues, categories, before, limit, all, tracker }, now),
    feedStatus(db, now, tab ?? undefined),
  ]);
  return NextResponse.json({ items, status }, { headers: { "Cache-Control": "no-store" } });
}
