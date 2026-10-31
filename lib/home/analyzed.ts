/* The home page's "Every position, analyzed.": the newest large position with an analyst note in each market (sports,
 * prediction markets, stocks), on the viewer's clock, as feed items (lib/moves/feed.ts) so each carries its note and
 * facts. And "Track record": the latest settled positions, wins and losses. Server only. */
import { desc, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { moves as movesT } from "@/lib/db/schema";
import { liveTabs } from "@/lib/features";
import { notComboSql } from "@/lib/moves/combos";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { fromRow, listMoves } from "@/lib/moves/store";
import { countsToRecord } from "@/lib/trust";
import type { Plan, Region } from "@/lib/types";

const T = sql`terminal.moves`;

export async function analyzedPositions(db: Db, plan: Plan, region: Region | null, now: number): Promise<FeedItem[]> {
  const until = now - movePlan(plan).delayMs;
  const picks = await Promise.all((["sports", "markets", "stocks"] as const).filter(t => liveTabs().includes(t)).map(tab =>
    db.select().from(movesT).where(sql`${T}.tab = ${tab} and ${T}.hidden_at is null and ${notComboSql} and ${T}.at <= ${new Date(until)} and ${T}.at > ${new Date(now - 7 * 86_400_000)}
        and exists (select 1 from terminal.analyst_notes n where n.move_id = ${T}.id)`).orderBy(desc(movesT.at)).limit(1).then(r => r.map(fromRow)).catch(() => [])));
  return feedItems(db, picks.flat(), plan, region, now);
}

export async function latestSettled(db: Db, plan: Plan, region: Region | null, now: number): Promise<FeedItem[]> {
  const settled = (await listMoves(db, { settled: true, limit: 40 }).catch(() => [])).filter(m => countsToRecord(m) && (m.result === "won" || m.result === "lost"));
  // Wins and losses both: the newest of each in turn, 6 in all.
  const won = settled.filter(m => m.result === "won"), lost = settled.filter(m => m.result === "lost");
  const mixed = Array.from({ length: 6 }, (_, i) => (i % 2 ? lost : won)[Math.floor(i / 2)]).filter((m): m is NonNullable<typeof m> => Boolean(m));
  return feedItems(db, mixed.sort((a, b) => (b.settledAt ?? b.at) - (a.settledAt ?? a.at)), plan, region, now, now);
}
