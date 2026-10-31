/* Analyst notes in Postgres (terminal.analyst_notes): the worker writes one for each new large position (newest first,
 * a few a minute, with a monthly spend cap: ANALYST_MONTHLY_USD, default $30, after which the template writes them),
 * and pages read them by position. Server only. */
import { desc, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { analystNotes, moves as movesT } from "@/lib/db/schema";
import { fromRow } from "@/lib/moves/store";
import { dbUsageStore } from "@/lib/worker/store";
import { factsFor } from "./facts";
import { writeNote } from "./note";
import { NOTE_VERSION, type Facts } from "./types";

export interface StoredNote { moveId: string; text: string; facts: Facts; model: string; origin: "model" | "template"; at: number }

const monthOf = (now: number) => `${new Date(now).toISOString().slice(0, 7)}:notes`;
export const notesCapUsd = (): number => Number(process.env.ANALYST_MONTHLY_USD ?? 30);

/** Writes notes for the newest large positions without one (or with one from older rules). Returns what it did. */
export async function notesOnce(db: Db, now: number, o: { limit?: number; f?: typeof fetch; log?: (s: string) => void } = {}): Promise<{ written: number; model: number; template: number; costUsd: number }> {
  const T = sql`terminal.moves`;
  const rows = await db.select().from(movesT).where(sql`${T}.hidden_at is null and ${T}.at > ${new Date(now - 2 * 86_400_000)}
      and not exists (select 1 from terminal.analyst_notes n where n.move_id = ${T}.id and n.version >= ${NOTE_VERSION})
      and (${T}.source <> 'sec' or ${T}.detail->>'kind' = 'insider')`)
    .orderBy(desc(movesT.at)).limit(o.limit ?? 12);
  const usage = dbUsageStore(db);
  const out = { written: 0, model: 0, template: 0, costUsd: 0 };
  for (const r of rows) {
    const m = fromRow(r);
    const facts = await factsFor(db, m, now);
    if (!facts.facts.length) continue;
    const over = (await usage.getMonthSpendUsd(monthOf(now))) >= notesCapUsd();
    const note = await writeNote(facts, { f: over ? (async () => { throw new Error("budget"); }) as unknown as typeof fetch : o.f });
    if (note.costUsd) await usage.addSpendUsd(monthOf(now), note.costUsd);
    await db.insert(analystNotes).values({ moveId: m.id, note: note.text, facts, model: note.model, origin: note.origin, version: note.version, costUsd: note.costUsd })
      .onConflictDoUpdate({ target: analystNotes.moveId, set: { note: note.text, facts, model: note.model, origin: note.origin, version: note.version, costUsd: note.costUsd, createdAt: new Date() } });
    out.written++; out[note.origin]++; out.costUsd += note.costUsd;
    o.log?.(`analyst: ${m.id} ${note.origin} ${note.model} $${note.costUsd.toFixed(5)}`);
  }
  return out;
}

/** The notes for these positions. */
export async function notesFor(db: Db, ids: readonly string[]): Promise<Map<string, StoredNote>> {
  if (!ids.length) return new Map();
  const r = await db.select().from(analystNotes).where(inArray(analystNotes.moveId, [...new Set(ids)]));
  return new Map(r.map(x => [x.moveId, { moveId: x.moveId, text: x.note, facts: x.facts, model: x.model, origin: x.origin, at: x.createdAt.getTime() }]));
}

/** Notes written so far and what they cost, for /methodology and the QA log. */
export async function noteStats(db: Db, now: number): Promise<{ notes: number; model: number; avgCostUsd: number; models: string[] }> {
  const r = (await db.execute(sql`select count(*)::int as n, count(*) filter (where origin = 'model')::int as m,
      coalesce(avg(cost_usd) filter (where origin = 'model'), 0)::float as c, coalesce(array_agg(distinct model) filter (where origin = 'model'), '{}') as models
    from terminal.analyst_notes where created_at > ${new Date(now - 30 * 86_400_000)}`)).rows[0] as { n: number; m: number; c: number; models: string[] };
  return { notes: Number(r.n), model: Number(r.m), avgCostUsd: Number(r.c), models: r.models ?? [] };
}
