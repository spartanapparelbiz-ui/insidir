/* What /status and /data show, all from real checks: each source's freshness (the newest position or filing we've
 * stored from it), each worker job's last heartbeat (green when its last run worked and is recent, amber when it's
 * behind, red when it failed), the hourly accuracy checks, this web server's uptime and the deploy it runs.
 * Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

/** When this web process started: its last deploy or restart. */
export const STARTED_AT = Date.now();
const MIN = 60_000, HOUR = 60 * MIN;

export type Light = "green" | "amber" | "red";
export interface SourceFresh { key: "polymarket" | "kalshi" | "form4" | "13f"; label: string; lastAt: number | null; light: Light; note: string }
export interface JobBeat { job: string; label: string; lastRunAt: number; lastOkAt: number | null; ok: boolean; error: string | null; light: Light }
export interface CheckRun { runAt: number; ok: number; checked: number; mismatch: number }
export interface Status {
  at: number;
  sources: SourceFresh[];
  jobs: JobBeat[];
  checks: CheckRun[];
  web: { startedAt: number; commit: string | null; deployment: string | null };
  overall: Light;
}

/** How stale each source may get before it's amber, then red: positions arrive all day; insiders file on business
 *  days; funds file quarterly. */
const LIMITS: Record<SourceFresh["key"], [number, number]> = {
  polymarket: [15 * MIN, 2 * HOUR], kalshi: [30 * MIN, 4 * HOUR], form4: [3 * 24 * HOUR, 7 * 24 * HOUR], "13f": [100 * 24 * HOUR, 140 * 24 * HOUR],
};
const LABELS: Record<SourceFresh["key"], string> = { polymarket: "Polymarket trades", kalshi: "Kalshi trades", form4: "SEC Form 4 (insider purchases)", "13f": "SEC 13F (fund holdings)" };

/** The jobs worth showing, by name prefix, with a plain label and how often they run (a beat older than 3 runs is
 *  amber). */
const JOBS: Array<[RegExp, string, number]> = [
  [/^moves$|^moves:polymarket|^poll:polymarket|^polymarket/, "Polymarket trades", 2 * MIN],
  [/^moves:kalshi|^poll:kalshi|^kalshi/, "Kalshi trades", 2 * MIN],
  [/^moves:settle$/, "Settlements", 10 * MIN],
  [/^moves:records$/, "Trader records", 5 * MIN],
  [/^markets:info$/, "Market prices", 5 * MIN],
  [/^accuracy$/, "Accuracy check", HOUR],
  [/^smart:splits$/, "Positioning", 5 * MIN],
  [/^stocks:form4$/, "SEC Form 4", 10 * MIN],
  [/^stocks:13f$/, "SEC 13F", 6 * HOUR],
  [/^stocks:prices$/, "Stock prices", HOUR],
];

export const lightOf = (age: number | null, [amber, red]: [number, number]): Light => (age === null ? "red" : age > red ? "red" : age > amber ? "amber" : "green");

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export async function readStatus(db: Db, now: number): Promise<Status> {
  const [f, h, c] = await Promise.all([
    db.execute(sql`select
        max(at) filter (where source = 'polymarket') as polymarket,
        max(at) filter (where source = 'kalshi') as kalshi,
        max(at) filter (where source = 'sec' and detail->>'kind' = 'insider') as form4,
        max(at) filter (where source = 'sec' and detail->>'kind' = 'fund') as f13
      from terminal.moves where at > ${new Date(now - 200 * 24 * HOUR)}`),
    db.execute(sql`select job, last_run_at, last_ok_at, ok, error from terminal.worker_heartbeats order by job`),
    db.execute(sql`select run_at, count(*) filter (where status = 'ok')::int as ok, count(*) filter (where status <> 'skipped')::int as checked,
        count(*) filter (where status = 'mismatch')::int as mismatch
      from terminal.accuracy_checks where run_at > ${new Date(now - 7 * 24 * HOUR)} group by run_at order by run_at desc limit 48`),
  ]);
  const fr = (f.rows[0] ?? {}) as Record<string, string | null>;
  const t = (v: string | null | undefined) => (v ? new Date(v).getTime() : null);
  const sources: SourceFresh[] = (["polymarket", "kalshi", "form4", "13f"] as const).map(key => {
    const lastAt = t(fr[key === "13f" ? "f13" : key]);
    return { key, label: LABELS[key], lastAt, light: lightOf(lastAt === null ? null : now - lastAt, LIMITS[key]), note: lastAt === null ? "Nothing stored yet" : `Latest seen ${ago(lastAt, now)}` };
  });
  const jobs: JobBeat[] = [];
  for (const row of h.rows as Array<{ job: string; last_run_at: string; last_ok_at: string | null; ok: boolean; error: string | null }>) {
    const def = JOBS.find(([re]) => re.test(row.job));
    if (!def || jobs.some(j => j.label === def[1])) continue;
    const lastRunAt = new Date(row.last_run_at).getTime(), lastOkAt = t(row.last_ok_at);
    const light: Light = !row.ok ? "red" : now - lastRunAt > 3 * def[2] ? "amber" : "green";
    jobs.push({ job: row.job, label: def[1], lastRunAt, lastOkAt, ok: row.ok, error: row.error, light });
  }
  const checks = (c.rows as Array<{ run_at: string; ok: number; checked: number; mismatch: number }>).map(r => ({ runAt: new Date(r.run_at).getTime(), ok: Number(r.ok), checked: Number(r.checked), mismatch: Number(r.mismatch) }));
  const lights = [...sources.filter(s => s.key !== "13f").map(s => s.light), ...jobs.map(j => j.light)];
  const overall: Light = lights.includes("red") ? "red" : lights.includes("amber") ? "amber" : "green";
  return { at: now, sources, jobs, checks, overall,
    web: { startedAt: STARTED_AT, commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null, deployment: process.env.RAILWAY_DEPLOYMENT_ID ?? null } };
}
