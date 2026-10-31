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
import { analystConfigured } from "./llm";

export interface StoredNote { moveId: string; text: string; facts: Facts; model: string; origin: "model" | "template"; at: number }

const monthOf = (now: number) => `${new Date(now).toISOString().slice(0, 7)}:notes`;
const dayOf = (now: number) => `${new Date(now).toISOString().slice(0, 10)}:notes`;
export const notesCapUsd = (): number => Number(process.env.ANALYST_MONTHLY_USD ?? 30);
export const notesDailyCapUsd = (): number => Number(process.env.ANALYST_DAILY_USD ?? 5);
/** Notes per run (the worker runs it every minute): a steady backfill without bursts. */
export const notesPerRun = (): number => Number(process.env.ANALYST_NOTES_PER_RUN ?? 20);

export interface NotesRun { written: number; model: number; template: number; failures: number; costUsd: number; left: number; lastError: string | null; capped: boolean }

/** Writes notes for positions that need one, newest first: every large position from the last 2 days, every open one
 *  from the last 60, and every one settled in the last 7 (the backfill); positions with a note from older rules; and,
 *  once a model is configured, every note the template wrote only because there was no model. Rate-limited per run,
 *  with a daily and a monthly spend cap past which the template writes them. */
export async function notesOnce(db: Db, now: number, o: { limit?: number; f?: typeof fetch; log?: (s: string) => void } = {}): Promise<NotesRun> {
  const T = sql`terminal.moves`;
  const modelOn = analystConfigured();
  const need = sql`${T}.hidden_at is null and (${T}.source <> 'sec' or ${T}.detail->>'kind' = 'insider')
      and (${T}.at > ${new Date(now - 2 * 86_400_000)} or (${T}.result is null and ${T}.at > ${new Date(now - 60 * 86_400_000)}) or ${T}.settled_at > ${new Date(now - 7 * 86_400_000)})
      and not exists (select 1 from terminal.analyst_notes n where n.move_id = ${T}.id and n.version >= ${NOTE_VERSION}
        and not (${modelOn} and n.model in ('template-nokey', 'template-error') and n.created_at < ${new Date(now - 10 * 60_000)}))`;
  const rows = await db.select().from(movesT).where(need).orderBy(desc(movesT.at)).limit(o.limit ?? notesPerRun());
  const usage = dbUsageStore(db);
  const out: NotesRun = { written: 0, model: 0, template: 0, failures: 0, costUsd: 0, left: 0, lastError: null, capped: false };
  for (const r of rows) {
    const m = fromRow(r);
    const facts = await factsFor(db, m, now);
    if (!facts.facts.length) continue;
    const over = (await usage.getMonthSpendUsd(monthOf(now))) >= notesCapUsd() || (await usage.getMonthSpendUsd(dayOf(now))) >= notesDailyCapUsd();
    out.capped ||= over;
    const note = await writeNote(facts, { f: over ? (async () => { throw new Error("budget"); }) as unknown as typeof fetch : o.f });
    if (note.costUsd) { await usage.addSpendUsd(monthOf(now), note.costUsd); await usage.addSpendUsd(dayOf(now), note.costUsd); }
    // Over the cap, the note is a template written "for lack of budget": retried like a failed call.
    const model = over && note.origin === "template" ? "template-error" : note.model;
    await db.insert(analystNotes).values({ moveId: m.id, note: note.text, facts, model, origin: note.origin, version: note.version, costUsd: note.costUsd })
      .onConflictDoUpdate({ target: analystNotes.moveId, set: { note: note.text, facts, model, origin: note.origin, version: note.version, costUsd: note.costUsd, createdAt: new Date() } });
    out.written++; out[note.origin]++; out.costUsd += note.costUsd;
    if (note.model === "template") out.failures++;
    if (note.error) out.lastError = note.error;
  }
  out.left = Number(((await db.execute(sql`select count(*)::int as n from ${T} where ${need}`)).rows[0] as { n: number }).n) ;
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
