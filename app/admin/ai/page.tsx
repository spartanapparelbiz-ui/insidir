/* /admin/ai: the analyst layer at a glance. Notes written today and this month (by the model, by the template, failed
 * the validator), what's left to backfill and the last error (the worker's analyst:notes heartbeat), Research
 * questions today and this month with their cost, and what notes and Research cost against their caps. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { analystConfigured, analystModel } from "@/lib/analyst/llm";
import { notesCapUsd, notesDailyCapUsd } from "@/lib/analyst/store";
import { getDb, hasDatabase } from "@/lib/db";
import { monthlyUsd } from "@/lib/research/ask";
import { dateTimeET } from "@/lib/moves/copy";
import "../../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI", robots: { index: false, follow: false } };

const usd = (v: number) => `$${v.toFixed(v < 1 ? 4 : 2)}`;

export default async function AiPage() {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now())) return <main className="wrap app adm"><h1 className="page__h">AI</h1><p className="muted">Sign in on <Link href="/admin">/admin</Link> first.</p></main>;
  if (!hasDatabase()) return <main className="wrap app adm"><h1 className="page__h">AI</h1><p className="muted">No database.</p></main>;
  const db = getDb(), now = new Date(), day = now.toISOString().slice(0, 10), month = day.slice(0, 7);
  const [notes, research, spend, beat] = await Promise.all([
    db.execute(sql`select
        count(*) filter (where created_at::date = current_date)::int as today,
        count(*) filter (where created_at::date = current_date and origin = 'model')::int as today_model,
        count(*) filter (where created_at >= date_trunc('month', now()))::int as month,
        count(*) filter (where created_at >= date_trunc('month', now()) and origin = 'model')::int as month_model,
        count(*) filter (where created_at >= date_trunc('month', now()) and model = 'template')::int as failed,
        count(*) filter (where model in ('template-nokey', 'template-error'))::int as waiting,
        count(*)::int as total,
        coalesce(sum(cost_usd) filter (where created_at::date = current_date), 0)::float as cost_today,
        coalesce(sum(cost_usd) filter (where created_at >= date_trunc('month', now())), 0)::float as cost_month
      from terminal.analyst_notes`).then(r => (r.rows[0] ?? {}) as Record<string, number>),
    db.execute(sql`select count(*) filter (where created_at::date = current_date)::int as today, count(*) filter (where created_at >= date_trunc('month', now()))::int as month,
        count(*) filter (where cached and created_at >= date_trunc('month', now()))::int as cached,
        coalesce(sum(cost_usd) filter (where created_at::date = current_date), 0)::float as cost_today, coalesce(sum(cost_usd) filter (where created_at >= date_trunc('month', now())), 0)::float as cost_month
      from terminal.research_queries`).then(r => (r.rows[0] ?? {}) as Record<string, number>),
    db.execute(sql`select month, usd, calls from terminal.llm_usage where month in (${`${month}:notes`}, ${`${day}:notes`}, ${`${month}:research`}, ${month})`).then(r => new Map((r.rows as Array<{ month: string; usd: number }>).map(x => [x.month, Number(x.usd)]))),
    db.execute(sql`select last_run_at, last_ok_at, ok, error, stats from terminal.worker_heartbeats where job = 'analyst:notes'`).then(r => r.rows[0] as { last_run_at: string; error: string | null; stats: Record<string, number | string> } | undefined),
  ]).catch(e => { throw e; });
  const row = (k: string, v: string | number | undefined) => <tr key={k}><th scope="row">{k}</th><td className="r">{v ?? "—"}</td></tr>;
  return (
    <main className="wrap app adm" data-testid="admin-ai">
      <h1 className="page__h">AI</h1>
      <p className="muted">{analystConfigured() ? `Model: ${analystModel()} (OpenRouter).` : "OPENROUTER_API_KEY isn't set: notes are written by the template and Research uses the planner."}</p>
      <section className="block"><h2 className="block__h">Analyst notes</h2>
        <table className="table"><tbody>
          {row("Today", `${notes.today} (${notes.today_model} by the model)`)}
          {row("This month", `${notes.month} (${notes.month_model} by the model)`)}
          {row("Failed the validator twice (template used), this month", notes.failed)}
          {row("Waiting for the model (template for now)", notes.waiting)}
          {row("Left to backfill (last run)", beat?.stats?.left ?? "—")}
          {row("Cost today", `${usd(Number(notes.cost_today))} of ${usd(notesDailyCapUsd())}`)}
          {row("Cost this month", `${usd(Number(notes.cost_month))} of ${usd(notesCapUsd())}`)}
          {row("Last run", beat ? dateTimeET(new Date(beat.last_run_at).getTime()) : "never")}
          {row("Last error", beat?.error ?? "none")}
        </tbody></table>
      </section>
      <section className="block"><h2 className="block__h">Research</h2>
        <table className="table"><tbody>
          {row("Questions today", research.today)}
          {row("Questions this month", `${research.month} (${research.cached} from the cache)`)}
          {row("Cost today", usd(Number(research.cost_today)))}
          {row("Cost this month", `${usd(spend.get(`${month}:research`) ?? Number(research.cost_month))} of ${usd(monthlyUsd())}`)}
        </tbody></table>
      </section>
    </main>
  );
}
