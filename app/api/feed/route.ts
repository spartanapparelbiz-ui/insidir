/* The feed for whoever is asking (session cookie), already redacted for their plan by lib/feed.ts: free callers get
 * the 30-minute-delayed top 3 without sizes, paid callers the live list. Plus the data status, so the refresher can
 * show "Live data paused, retrying". Never cached. */
import { NextResponse } from "next/server";
import { feedViewer, getViewer } from "@/lib/auth/viewer";
import { feedFor, type FeedRow } from "@/lib/feed";
import { storedOpps } from "@/lib/queries";
import { dataStatus, type DataStatus } from "@/lib/status";
import type { Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface FeedResponse { now: number; plan: Plan; status: DataStatus; rows: FeedRow[] }

export async function GET() {
  const now = Date.now();
  const viewer = await getViewer();
  const [opps, status] = await Promise.all([storedOpps(), dataStatus(now)]);
  const body: FeedResponse = { now, plan: viewer.plan, status, rows: feedFor(opps, feedViewer(viewer), now) };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
