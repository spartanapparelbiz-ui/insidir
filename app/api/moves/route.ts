/* GET /api/moves?tab=sports|markets&min=10000&league=NFL&before=<ms>&limit=30
 * The feed, gated by plan and region on the server (lib/moves/feed.ts). A tab that isn't live (Crypto; Stocks until
 * it is in FEATURES_READY) returns an empty list. */
import { NextResponse, type NextRequest } from "next/server";
import { memberOrNull } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { feedFor, feedStatus } from "@/lib/moves/feed";
import { LEAGUES, type League, type Tab } from "@/lib/moves/types";
import { liveTabs } from "@/lib/features";

export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  const now = Date.now();
  const p = req.nextUrl.searchParams;
  const tab = p.get("tab") as Tab | null;
  if (tab && !liveTabs().includes(tab)) return NextResponse.json({ items: [], status: null, comingSoon: true });
  const league = p.get("league") as League | null;
  const min = Math.max(0, Number(p.get("min")) || 0);
  const before = Number(p.get("before")) || undefined;
  const limit = Math.min(50, Math.max(1, Number(p.get("limit")) || 30));
  if (!hasDatabase()) return NextResponse.json({ items: [], status: { state: "behind", lastAt: null, text: "Catching up · waiting for the first update" } });
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: "Members only. Get Insidir · $39/mo." }, { status: 401 });
  const db = getDb();
  const [items, status] = await Promise.all([
    feedFor(db, viewer.plan, viewer.region, { tab: tab ?? undefined, min, league: league && LEAGUES.includes(league) ? league : undefined, before, limit }, now),
    feedStatus(db, now, tab ?? undefined),
  ]);
  return NextResponse.json({ items, status }, { headers: { "Cache-Control": "no-store" } });
}
