/* What every SEC page needs about its viewer: are they paying (members only), and how many watchlist alerts they
 * haven't read (the Watchlists tab's badge). Server only. */
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { isPaid } from "@/lib/plans";
import { unreadCount } from "@/lib/stocks/watchlists";

export async function secViewer() {
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const unread = paid && viewer.user && hasDatabase() && isReady("watchlists") ? await unreadCount(getDb(), viewer.user.id).catch(() => 0) : 0;
  return { viewer, paid, unread, userId: viewer.user?.id ?? null };
}
