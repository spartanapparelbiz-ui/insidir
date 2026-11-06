/* PUT /api/filings/watchlists {lists}: replaces the member's lists (one row each). The browser sends the whole set,
 * debounced, after any pin, unpin, rename or reorder. */
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bad, filingsMember, privateJson } from "@/lib/filings/api";
import { saveWatchlists } from "@/lib/filings/store";
import { WatchlistsBody } from "@/lib/filings/validate";

export async function PUT(req: NextRequest) {
  const m = await filingsMember();
  if (!("userId" in m)) return m;
  const body = WatchlistsBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad("Lists couldn't be saved: check names and sizes.");
  return privateJson({ lists: await saveWatchlists(getDb(), m.userId, body.data.lists) });
}
