/* What /admin shows of the accuracy check (lib/accuracy/check.ts): the latest run, recent mismatches and the moves
 * hidden right now. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

export interface RunSummary { runAt: number; ok: number; mismatch: number; skipped: number; moves: number; profiles: number }
export interface Mismatch { runAt: number; kind: string; what: string; target: string; label: string; problems: string[] }
export interface HiddenMove { id: string; source: string; title: string; amount: number; hiddenAt: number; reason: string | null }

export async function accuracyOverview(db: Db, days = 7): Promise<{ runs: RunSummary[]; mismatches: Mismatch[]; hidden: HiddenMove[] }> {
  const runs = (await db.execute(sql`select run_at, count(*) filter (where status = 'ok')::int as ok, count(*) filter (where status = 'mismatch')::int as mismatch,
      count(*) filter (where status = 'skipped')::int as skipped, count(*) filter (where kind = 'move')::int as moves, count(*) filter (where kind = 'profile')::int as profiles
    from terminal.accuracy_checks where run_at > now() - make_interval(days => ${days}) group by run_at order by run_at desc limit 48`)).rows as Array<Record<string, unknown>>;
  const mismatches = (await db.execute(sql`select run_at, kind, what, target, label, problems from terminal.accuracy_checks
    where status = 'mismatch' and run_at > now() - make_interval(days => ${days}) order by run_at desc limit 200`)).rows as Array<Record<string, unknown>>;
  const hidden = (await db.execute(sql`select id, source, coalesce(nullif(market_title, ''), event_title) as title, amount, hidden_at, hidden_reason
    from terminal.moves where hidden_at is not null order by hidden_at desc limit 200`)).rows as Array<Record<string, unknown>>;
  const ms = (v: unknown) => new Date(v as string).getTime();
  return {
    runs: runs.map(r => ({ runAt: ms(r.run_at), ok: Number(r.ok), mismatch: Number(r.mismatch), skipped: Number(r.skipped), moves: Number(r.moves), profiles: Number(r.profiles) })),
    mismatches: mismatches.map(r => ({ runAt: ms(r.run_at), kind: String(r.kind), what: String(r.what), target: String(r.target), label: String(r.label), problems: r.problems as string[] })),
    hidden: hidden.map(r => ({ id: String(r.id), source: String(r.source), title: String(r.title), amount: Number(r.amount), hiddenAt: ms(r.hidden_at), reason: (r.hidden_reason as string | null) ?? null })),
  };
}
