/* Market twins in the database (terminal.market_twins). The worker rebuilds candidates from every active market both
 * venues list (terminal.markets) with the strict twin test (lib/twins/check.ts). A person approves or denies each one in
 * /admin/twins; only approved twins are ever used (a Kalshi link, a Kalshi price, a ping). A twin whose checks change
 * after approval goes back to pending. */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { marketTwins } from "@/lib/db/schema";
import type { VMarket } from "@/lib/types";
import { findTwins } from "./check";

export interface Twin { polymarketId: string; kalshiId: string; kalshiUrl: string; kalshiTitle: string; polymarketTitle: string; kind: string }

/** Rebuilds twins from the stored active markets. Returns counts by verdict. Decisions survive unless the checks
 *  change, in which case the twin goes back to pending. */
export async function buildTwins(db: Db, now: number): Promise<{ candidate: number; review: number }> {
  const rows = (await db.execute(sql`select venue, data from terminal.markets where (data->>'active')::boolean and (
      (data->>'closeTime') is null or (data->>'closeTime')::bigint > ${now - 86_400_000})`)).rows as Array<{ venue: string; data: VMarket }>;
  const poly = rows.filter(r => r.venue === "polymarket").map(r => r.data), kalshi = rows.filter(r => r.venue === "kalshi").map(r => r.data);
  const twins = findTwins(poly, kalshi);
  const counts = { candidate: 0, review: 0 };
  for (const t of twins) {
    counts[t.result.verdict as "candidate" | "review"]++;
    const v = {
      polymarketId: t.poly.id, kalshiId: t.kalshi.id, kalshiUrl: t.kalshi.url, polymarketTitle: t.poly.title, kalshiTitle: t.kalshi.title,
      kind: t.result.kind, verdict: t.result.verdict as "candidate" | "review", confidence: t.result.confidence, checks: t.result.checks, notes: t.result.notes,
      polymarketClose: t.poly.closeTime ? new Date(t.poly.closeTime) : null, kalshiClose: t.kalshi.closeTime ? new Date(t.kalshi.closeTime) : null, updatedAt: new Date(now),
    };
    await db.insert(marketTwins).values(v).onConflictDoUpdate({
      target: marketTwins.polymarketId,
      set: {
        ...v,
        // A different Kalshi market or different checks undo a decision: a person looks again.
        status: sql`case when ${marketTwins.kalshiId} = ${v.kalshiId} and ${marketTwins.checks} = ${JSON.stringify(v.checks)}::jsonb then ${marketTwins.status} else 'pending' end`,
      },
    });
  }
  return counts;
}

/** Approved twins for these Polymarket markets. Nothing pending or denied is ever returned. */
export async function approvedTwins(db: Db, polymarketIds: readonly string[]): Promise<Map<string, Twin>> {
  const ids = [...new Set(polymarketIds)];
  if (!ids.length) return new Map();
  const r = await db.select().from(marketTwins).where(and(inArray(marketTwins.polymarketId, ids), eq(marketTwins.status, "approved")));
  return new Map(r.map(x => [x.polymarketId, { polymarketId: x.polymarketId, kalshiId: x.kalshiId, kalshiUrl: x.kalshiUrl, kalshiTitle: x.kalshiTitle, polymarketTitle: x.polymarketTitle, kind: x.kind }]));
}

export async function twinsForReview(db: Db, status: "pending" | "approved" | "denied" = "pending", limit = 200) {
  return db.select().from(marketTwins).where(eq(marketTwins.status, status)).orderBy(sql`${marketTwins.verdict} = 'review' desc, ${marketTwins.confidence} desc, ${marketTwins.updatedAt} desc`).limit(limit);
}

export async function decideTwins(db: Db, ids: readonly string[], status: "approved" | "denied" | "pending", by: string, now: number): Promise<number> {
  if (!ids.length) return 0;
  const r = await db.update(marketTwins).set({ status, decidedAt: new Date(now), decidedBy: by }).where(inArray(marketTwins.polymarketId, [...ids])).returning({ id: marketTwins.polymarketId });
  return r.length;
}
