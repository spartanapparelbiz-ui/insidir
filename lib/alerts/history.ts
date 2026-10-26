/* The Alerts page's history: the last alerts actually sent to a user (terminal.alerts_sent), with the deal's title.
 * Server only. */
import { desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { alertsSent, opportunities } from "@/lib/db/schema";

export interface SentAlert { oppId: string; title: string | null; channel: "push" | "email"; sentAt: number; opened: boolean }

export async function alertHistory(userId: string, limit = 20): Promise<SentAlert[] | null> {
  if (!hasDatabase()) return [];
  try {
    const rows = await getDb().select({ oppId: alertsSent.oppId, channel: alertsSent.channel, sentAt: alertsSent.sentAt, openedAt: alertsSent.openedAt, data: opportunities.data })
      .from(alertsSent).leftJoin(opportunities, eq(opportunities.id, alertsSent.oppId))
      .where(eq(alertsSent.userId, userId)).orderBy(desc(alertsSent.sentAt)).limit(limit);
    return rows.map(r => ({ oppId: r.oppId, title: r.data?.title ?? null, channel: r.channel, sentAt: r.sentAt.getTime(), opened: r.openedAt !== null }));
  } catch (e) {
    console.error("alertHistory failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
