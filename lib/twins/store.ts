/* Market twins in the database (terminal.market_twins). The worker rebuilds candidates from every active market both
 * venues list (terminal.markets) with the strict twin test (lib/twins/check.ts). A candidate whose five fields all match
 * from the venues' structured data (lib/twins/structured.ts) approves itself (decided_by "auto"); everything else waits
 * for a person in /admin/twins. Only approved twins are ever used (a Kalshi link, a Kalshi price, a ping). A twin whose
 * Kalshi market or checks change goes back to pending; a twin a person denied or revoked never approves itself again
 * unless the pair itself changes. */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { marketTwins } from "@/lib/db/schema";
import type { VMarket } from "@/lib/types";
import { findTwins } from "./check";
import { autoCheck } from "./structured";

export interface Twin { polymarketId: string; kalshiId: string; kalshiUrl: string; kalshiTitle: string; polymarketTitle: string; kind: string }

/** Rebuilds twins from the stored active markets. Returns counts by verdict. Decisions survive unless the checks
 *  change, in which case the twin goes back to pending. */
export async function buildTwins(db: Db, now: number): Promise<{ candidate: number; review: number; auto: number }> {
  const rows = (await db.execute(sql`select venue, data from terminal.markets where (data->>'active')::boolean and (
      (data->>'closeTime') is null or (data->>'closeTime')::bigint > ${now - 86_400_000})`)).rows as Array<{ venue: string; data: VMarket }>;
  const poly = rows.filter(r => r.venue === "polymarket").map(r => r.data), kalshi = rows.filter(r => r.venue === "kalshi").map(r => r.data);
  const twins = findTwins(poly, kalshi);
  const counts = { candidate: 0, review: 0, auto: 0 };
  for (const t of twins) {
    counts[t.result.verdict as "candidate" | "review"]++;
    const a = autoCheck(t.poly, t.kalshi);
    const auto = a.auto && t.result.verdict === "candidate";
    const v = {
      polymarketId: t.poly.id, kalshiId: t.kalshi.id, kalshiUrl: t.kalshi.url, polymarketTitle: t.poly.title, kalshiTitle: t.kalshi.title,
      kind: t.result.kind, verdict: t.result.verdict as "candidate" | "review", confidence: t.result.confidence, checks: t.result.checks, notes: t.result.notes,
      polymarketClose: t.poly.closeTime ? new Date(t.poly.closeTime) : null, kalshiClose: t.kalshi.closeTime ? new Date(t.kalshi.closeTime) : null, updatedAt: new Date(now),
      auto: a,
    };
    const same = sql`${marketTwins.kalshiId} = ${v.kalshiId} and ${marketTwins.checks} = ${JSON.stringify(v.checks)}::jsonb`;
    const r = await db.insert(marketTwins).values({ ...v, ...(auto ? { status: "approved" as const, decidedBy: "auto", decidedAt: new Date(now) } : {}) }).onConflictDoUpdate({
      target: marketTwins.polymarketId,
      set: {
        ...v,
        // A different Kalshi market or different checks undo a decision: it looks again (itself, or a person). A pending
        // twin that now passes the structured check approves itself; a person's decision on the same pair stands.
        status: auto
          ? sql`case when ${same} and ${marketTwins.status} <> 'pending' then ${marketTwins.status} else 'approved' end`
          : sql`case when ${same} then ${marketTwins.status} else 'pending' end`,
        decidedBy: auto ? sql`case when ${same} and ${marketTwins.status} <> 'pending' then ${marketTwins.decidedBy} else 'auto' end` : sql`case when ${same} then ${marketTwins.decidedBy} else null end`,
        decidedAt: auto ? sql`case when ${same} and ${marketTwins.status} <> 'pending' then ${marketTwins.decidedAt} else ${new Date(now)} end` : sql`case when ${same} then ${marketTwins.decidedAt} else null end`,
      },
    }).returning({ by: marketTwins.decidedBy, at: marketTwins.decidedAt });
    if (r[0]?.by === "auto" && r[0].at && r[0].at.getTime() === now) counts.auto++;
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

/** Twins that approved themselves on a day (ET midnight to midnight), newest first, with what matched. */
export async function autoApproved(db: Db, from: number, to: number) {
  return db.select().from(marketTwins).where(and(eq(marketTwins.decidedBy, "auto"), sql`${marketTwins.decidedAt} >= ${new Date(from)} and ${marketTwins.decidedAt} < ${new Date(to)}`))
    .orderBy(sql`${marketTwins.decidedAt} desc`).limit(1000);
}
