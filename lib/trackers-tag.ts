/* Stores each move's fixed tracker tags (lib/trackers.ts) on the move, so tracker lists and records are an indexed
 * lookup. New moves are tagged within a run; when a rule changes (TRACKER_RULES_V) every move is tagged again, newest
 * first, keeping the observed tags (Steam, Early money, Late money) it already had. Server only. */
import { desc, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { moves } from "@/lib/db/schema";
import type { Move } from "@/lib/moves/types";
import { retag, TRACKER_RULES_V } from "./trackers";

export async function tagOnce(db: Db, batch = 10_000): Promise<number> {
  // Only what the rules read (no fills): a batch stays small in the worker's memory.
  const rows = await db.select({ id: moves.id, source: moves.source, amount: moves.amount, avgPrice: moves.avgPrice, wallet: moves.wallet, tab: moves.tab,
    league: moves.league, category: moves.category, eventTitle: moves.eventTitle, marketTitle: moves.marketTitle, marketId: moves.marketId,
    newWallet: moves.newWallet, at: moves.at, detail: moves.detail, trackers: moves.trackers }).from(moves)
    .where(or(isNull(moves.trackersV), lt(moves.trackersV, TRACKER_RULES_V))).orderBy(desc(moves.at)).limit(batch);
  if (!rows.length) return 0;
  const updates = rows.map(r => ({ id: r.id, tags: retag({ ...r, league: r.league as Move["league"], at: r.at.getTime(), detail: (r.detail as Move["detail"]) ?? null }) }));
  // One statement for the batch: the ids and their tags as one JSON array.
  await db.execute(sql`update terminal.moves m set trackers = array(select jsonb_array_elements_text(u.tags)), trackers_v = ${TRACKER_RULES_V}
    from jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) as u(id text, tags jsonb) where m.id = u.id`);
  return rows.length;
}

/** Adds observed tags to moves (never removes one: a bet the price moved toward stays Steam after it settles). */
export async function addTags(db: Db, tagged: ReadonlyArray<{ id: string; tags: string[] }>): Promise<number> {
  const l = tagged.filter(t => t.tags.length);
  if (!l.length) return 0;
  const r = await db.execute(sql`update terminal.moves m set trackers = array(select distinct x from unnest(coalesce(m.trackers, '{}') || array(select jsonb_array_elements_text(u.tags))) as x order by 1)
    from jsonb_to_recordset(${JSON.stringify(l)}::jsonb) as u(id text, tags jsonb)
    where m.id = u.id and not (coalesce(m.trackers, '{}') @> array(select jsonb_array_elements_text(u.tags)))`);
  return Number(r.rowCount ?? 0);
}

