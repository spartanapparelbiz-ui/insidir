/* The Alerts page's history: the last alerts actually sent to a user (terminal.alerts_sent), each with what it was
 * about and where it goes. Move alerts are stored as "move:<id>"; anything else is a Price gaps deal. Server only. */
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { alertsSent, moves, opportunities } from "@/lib/db/schema";
import { dollars, onWhat } from "@/lib/moves/copy";
import { fromRow } from "@/lib/moves/store";

export interface SentAlert { key: string; title: string | null; href: string; channel: "push" | "email"; sentAt: number; opened: boolean }

export async function alertHistory(userId: string, limit = 20): Promise<SentAlert[] | null> {
  if (!hasDatabase()) return [];
  try {
    const db = getDb();
    const rows = await db.select({ oppId: alertsSent.oppId, channel: alertsSent.channel, sentAt: alertsSent.sentAt, openedAt: alertsSent.openedAt, data: opportunities.data })
      .from(alertsSent).leftJoin(opportunities, eq(opportunities.id, alertsSent.oppId))
      .where(eq(alertsSent.userId, userId)).orderBy(desc(alertsSent.sentAt)).limit(limit);
    const moveIds = rows.filter(r => r.oppId.startsWith("move:")).map(r => r.oppId.slice(5));
    const byId = new Map(moveIds.length ? (await db.select().from(moves).where(inArray(moves.id, moveIds))).map(r => [r.id, fromRow(r)]) : []);
    return rows.map(r => {
      const base = { key: `${r.oppId}-${r.channel}`, channel: r.channel, sentAt: r.sentAt.getTime(), opened: r.openedAt !== null };
      if (!r.oppId.startsWith("move:")) return { ...base, title: r.data?.title ?? null, href: `/deal/${encodeURIComponent(r.oppId)}` };
      const m = byId.get(r.oppId.slice(5));
      return { ...base, title: m ? `${dollars(m.amount)} on ${onWhat(m)}` : null, href: m ? `/market/${encodeURIComponent(m.marketId)}` : "/feed" };
    });
  } catch (e) {
    console.error("alertHistory failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
