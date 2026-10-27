/* What the landing hero falls back to when no deal is live (components/landing/model.ts picks; this reads). Server only.
 *   closedDeals: green cross-venue receipts from the last 7 days whose deal has stopped being found, with when.
 *   nearMisses:  the closest matched market per venue pair at the last scan (written by the worker). */
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { nearMisses as nearMissTable, opportunities, receipts } from "@/lib/db/schema";
import type { NearMiss } from "@/lib/engines/near-miss";
import type { ClosedDeal } from "@/components/landing/model";

export async function closedDeals(now: number): Promise<ClosedDeal[]> {
  if (!hasDatabase()) return [];
  try {
    const rows = await getDb().select({ snapshot: receipts.snapshot, detectedAt: receipts.detectedAt, lastSeenAt: opportunities.lastSeenAt, active: opportunities.active })
      .from(receipts).innerJoin(opportunities, eq(opportunities.id, receipts.oppId))
      .where(and(eq(receipts.kind, "cross_arb"), eq(receipts.safety, "green"), gte(receipts.detectedAt, new Date(now - 7 * 86_400_000))))
      .orderBy(desc(opportunities.lastSeenAt)).limit(200);
    // A deal still being found hasn't closed; one inactive (or not re-confirmed lately) closed when last seen.
    return rows.filter(r => !r.active || r.lastSeenAt.getTime() < now - 5 * 60_000)
      .map(r => ({ snapshot: r.snapshot, detectedAt: r.detectedAt.getTime(), closedAt: r.lastSeenAt.getTime() }));
  } catch (e) {
    console.error("closedDeals failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function nearMisses(): Promise<NearMiss[]> {
  if (!hasDatabase()) return [];
  try {
    return (await getDb().select({ data: nearMissTable.data }).from(nearMissTable)).map(r => r.data);
  } catch (e) {
    console.error("nearMisses failed:", e instanceof Error ? e.message : e);
    return [];
  }
}
