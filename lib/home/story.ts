/* The home page's scroll story ("How Insidir works in 10 seconds", components/home/Story.tsx), told with one real trader:
 *   1. a big bet happens      their biggest recent Polymarket move, on the viewer's clock (free: 30 minutes late)
 *   2. Insidir catches it     that move sliding into a feed of the latest real moves
 *   3. who it is              their record ("Won 41 of 63 · +$1.2M all-time") and real profit curve
 *   4. pinged next time       the push alert we would send for that move (lib/moves/alerts.ts)
 * The trader is a top trader (lib/moves/records.ts) with a recent big move; when none has moved this week, a top
 * trader's real past settled move. Nothing is invented: with no such trader, the story isn't shown. The home page
 * shows this record to members; visitors see it blurred (a placeholder, never the numbers). */
import type { Db } from "@/lib/db";
import { isMainstream } from "./curate";
import { alertMessage } from "@/lib/moves/alerts";
import { recordLine } from "@/lib/moves/copy";
import { movePlan } from "@/lib/moves/gate";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { isTopTrader, walletLabel } from "@/lib/moves/records";
import { listMoves, recordsFor } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import type { Plan, Region } from "@/lib/types";
import { profitPath } from "@/lib/profiles/chart";
import { marketsFor } from "@/lib/profiles/store";
import { traderStats } from "@/lib/profiles/trader";

const WEEK = 7 * 86_400_000;

export interface Story {
  move: FeedItem;
  /** The feed the move slides into: the latest other real moves. */
  feed: FeedItem[];
  trader: { name: string; wallet: string; record: string; blurred: boolean; chart: { path: string; width: number; height: number; zeroY: number } | null };
  alert: { title: string; body: string };
  /** The move is a past settled one (nobody top-ranked moved this week). */
  past: boolean;
}

export async function storyFor(db: Db, plan: Plan, region: Region | null, until: number, now: number, appUrl: string): Promise<Story | null> {
  const pick = async (ms: Move[]) => {
    // A move a newcomer can read (lib/home/curate.ts): a major league, politics, the economy.
    const withWallet = ms.filter(m => m.source === "polymarket" && m.wallet && isMainstream(m));
    const recs = await recordsFor(db, withWallet.map(m => m.wallet!));
    const m = withWallet.find(x => isTopTrader(recs.get(x.wallet!)));
    return m ? { m, rec: recs.get(m.wallet!)! } : null;
  };
  let past = false;
  let hit = await pick(await listMoves(db, { since: now - WEEK, until, byAmount: true, limit: 200 }));
  if (!hit) { hit = await pick(await listMoves(db, { settled: true, limit: 200 })); past = true; }
  if (!hit) return null;
  const { m, rec } = hit;
  const record = recordLine(rec);
  if (!record) return null;
  const [items, latest, markets] = await Promise.all([
    feedItems(db, [m], plan, region, now),
    listMoves(db, { until, limit: 200 }).then(ms => ms.filter(isMainstream)),
    marketsFor(db, m.wallet!).catch(() => []),
  ]);
  const feed = await feedItems(db, latest.filter(x => x.id !== m.id).slice(0, 2), plan, region, now);
  const s = markets.length ? traderStats(markets, now) : null;
  const geom = s ? profitPath(s.series, 320, 120, 6) : null;
  // Without a plan the record is a blurred placeholder: the real numbers never leave the server.
  const shown = movePlan(plan).records;
  return {
    move: items[0]!, feed, past,
    trader: { name: walletLabel(m.wallet!, rec.name ?? m.walletName), wallet: m.wallet!, record: shown ? record : "Won 00 of 00 · +$00K all-time", blurred: !shown, chart: shown && geom ? { path: geom.path, width: geom.width, height: geom.height, zeroY: geom.zeroY } : null },
    alert: (({ title, body }) => ({ title, body }))(alertMessage(m, null, "trader", appUrl, now)),
  };
}
