/* The feed for whoever is asking (session cookie), already redacted for their plan by lib/feed.ts: free callers get
 * the 30-minute-delayed top 3 without sizes, paid callers the live list. Plus the data status, so the refresher can
 * show "Live data paused, retrying". Never cached. */
import { MEMBERS_ONLY } from "@/lib/copy";
import { NextResponse } from "next/server";
import { feedViewer, memberOrNull } from "@/lib/auth/viewer";
import { feedFor, type FeedRow } from "@/lib/feed";
import { isPaid } from "@/lib/plans";
import { storedOpps } from "@/lib/queries";
import { withSparks } from "@/lib/terminal-data";
import { dataStatus, type DataStatus } from "@/lib/status";
import type { Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface FeedResponse { now: number; plan: Plan; status: DataStatus; rows: FeedRow[] }

export async function GET() {
  const now = Date.now();
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: MEMBERS_ONLY }, { status: 401 });
  const [opps, status] = await Promise.all([storedOpps(), dataStatus(now)]);
  const rows = feedFor(opps, feedViewer(viewer), now);
  const body: FeedResponse = { now, plan: viewer.plan, status, rows: isPaid(viewer.plan) ? await withSparks(rows, opps, now) : rows };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
