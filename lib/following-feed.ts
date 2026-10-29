/* A member's Following feed (/following), newest first over the last FOLLOWING_DAYS days: big moves in followed
 * trackers, by followed traders and in followed markets (as feed cards, lib/moves/feed.ts), each Form 4 by a followed insider or at a
 * followed company, and each new 13F by a followed fund (lib/follows.ts). Server only. */
import type { Db } from "@/lib/db";
import type { FollowKind } from "@/lib/db/schema";
import type { Plan, Region } from "@/lib/types";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { listMoves } from "@/lib/moves/store";
import { companyHref, fundHref, insiderHref } from "@/lib/profiles/name";
import { followedTrades, fundOf, fundQuarters } from "@/lib/profiles/store";
import { fundItem, tradeItems, type FilingItem } from "./follows";
import { sql } from "drizzle-orm";
import { trackerBySlug, type Tracker } from "./trackers";

export const FOLLOWING_DAYS = 30;
export const FOLLOWING_MAX = 40;

export type FollowingEntry = { type: "move"; at: number; item: FeedItem } | { type: "filing"; at: number; item: FilingItem };

export async function followingFeed(db: Db, list: ReadonlyArray<{ kind: FollowKind; target: string }>, plan: Plan, region: Region | null, now: number): Promise<FollowingEntry[]> {
  const of = (k: FollowKind) => list.filter(f => f.kind === k).map(f => f.target);
  const since = now - FOLLOWING_DAYS * 86_400_000;
  const [wallets, marketIds, insiders, companies, funds] = [of("trader"), of("market"), of("insider"), of("company"), of("fund")];
  const trackers = of("tracker").map(trackerBySlug).filter((t): t is Tracker => t !== null);
  const [moves, trades, fundItems] = await Promise.all([
    Promise.all([
      wallets.length || marketIds.length ? listMoves(db, { followed: { wallets, marketIds }, since, until: now, limit: FOLLOWING_MAX }) : Promise.resolve([]),
      // A followed tracker's moves: any of its rules (lib/trackers.ts).
      trackers.length ? listMoves(db, { where: sql`(${sql.join(trackers.map(t => t.where()), sql` or `)})`, since, until: now, limit: FOLLOWING_MAX }) : Promise.resolve([]),
    ]).then(([a, b]) => {
      const seen = new Set<string>();
      return [...a, ...b].filter(m => !seen.has(m.id) && Boolean(seen.add(m.id))).sort((x, y) => y.at - x.at).slice(0, FOLLOWING_MAX);
    }).then(ms => feedItems(db, ms, plan, region, now)),
    insiders.length || companies.length ? followedTrades(db, insiders, companies, new Date(since)) : Promise.resolve([]),
    Promise.all(funds.slice(0, 50).map(async cik => {
      const [fund, qs] = await Promise.all([fundOf(db, cik), fundQuarters(db, cik, 2)]);
      const cur = qs[0];
      if (!fund || !cur || Date.parse(`${cur.filedOn}T21:00:00Z`) < since) return null;
      return fundItem({ fundCik: cik, fund: fund.name, accession: cur.accession, period: cur.period, filedOn: cur.filedOn, url: cur.url, holdings: cur.holdings, prev: qs[1]?.holdings ?? null }, fundHref(cik, fund.name));
    })),
  ]);
  const filings = tradeItems(trades, { insiders: new Set(insiders), companies: new Set(companies) }, { insider: insiderHref, company: companyHref });
  const out: FollowingEntry[] = [
    ...moves.map(item => ({ type: "move" as const, at: item.at, item })),
    ...[...filings, ...fundItems.filter((x): x is FilingItem => x !== null)].map(item => ({ type: "filing" as const, at: item.at, item })),
  ];
  return out.sort((a, b) => b.at - a.at).slice(0, FOLLOWING_MAX);
}
