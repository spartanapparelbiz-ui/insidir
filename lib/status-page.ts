/* What /status and /data show, all from real checks: each source's freshness (the newest position or filing we've
 * stored from it), each worker job's last heartbeat (green when its last run worked and is recent, amber when it's
 * behind, red when it failed), the hourly accuracy checks, this web server's uptime and the deploy it runs.
 * Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { coverageSince } from "@/lib/stocks/backfill";
import { alertLatency } from "@/lib/stocks/watchlists";

/** When this web process started: its last deploy or restart. */
export const STARTED_AT = Date.now();
const MIN = 60_000, HOUR = 60 * MIN;

export type Light = "green" | "amber" | "red";
export interface SourceFresh { key: "polymarket" | "kalshi" | "form4" | "13f"; label: string; lastAt: number | null; light: Light; note: string }
export interface JobBeat { job: string; label: string; lastRunAt: number; lastOkAt: number | null; ok: boolean; error: string | null; light: Light }
/** The proven-wallet backfill's last run (lib/moves/proven-backfill.ts): its request rate against the Data API limit. */
export interface BackfillRate { at: number; wallets: number; requests: number; reqPerSec: number; limitPerSec: number; share: number; rateLimited: number; queued: number; due: number }
export interface CheckRun { runAt: number; ok: number; checked: number; mismatch: number }
export interface Status {
  at: number;
  sources: SourceFresh[];
  jobs: JobBeat[];
  /** The SEC terminal: the day from which every Form 4 is read, and watchlist alerts' speed over the last day. */
  sec: { since: string | null; alerts: number; p50s: number | null; p95s: number | null };
  backfill: BackfillRate | null;
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
  // Not ^kalshi: kalshi:asks (the record's past prices) is its own row and must not light the trades source.
  [/^moves:kalshi|^poll:kalshi/, "Kalshi trades", 2 * MIN],
  [/^moves:settle$/, "Settlements", 10 * MIN],
  [/^moves:records$/, "Trader records", 5 * MIN],
  [/^moves:proven-backfill$/, "Proven-wallet backfill", MIN],
  [/^markets:info$/, "Market prices", 3 * MIN],
  [/^twins:bets$/, "Kalshi twins", 4 * MIN],
  [/^twins:history$/, "Record: Kalshi twins of past games", 2 * MIN],
  [/^kalshi:asks$/, "Record: Kalshi prices at past trades", MIN],
  [/^accuracy$/, "Accuracy check", HOUR],
  [/^monitor:money-path$/, "Live tests", 15 * MIN],
  [/^smart:splits$/, "Positioning", 5 * MIN],
  // The SEC research terminal (docs/INSIDIR-V3.md §3).
  [/^sec:form4$/, "SEC: insider filings, live", 2 * MIN],
  [/^sec:backfill$/, "SEC: insider filings, backfill", MIN],
  [/^sec:current$/, "SEC: 8-K, 10-Q, 10-K, 13D/G, live", 2 * MIN],
  [/^sec:companies$/, "SEC: company reports", MIN],
  [/^sec:alerts$/, "SEC: watchlist signals", MIN],
  [/^accuracy:filings$/, "SEC: Form 4 accuracy check", HOUR],
  [/^accuracy:companies$/, "SEC: financials accuracy check", HOUR],
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
    db.execute(sql`select job, last_run_at, last_ok_at, ok, error, stats from terminal.worker_heartbeats order by job`),
    db.execute(sql`select run_at, count(*) filter (where status = 'ok')::int as ok, count(*) filter (where status <> 'skipped')::int as checked,
        count(*) filter (where status = 'mismatch')::int as mismatch
      from terminal.accuracy_checks where run_at > ${new Date(now - 7 * 24 * HOUR)} group by run_at order by run_at desc limit 48`),
  ]);
  const fr = (f.rows[0] ?? {}) as Record<string, string | null>;
  const t = (v: string | null | undefined) => (v ? new Date(v).getTime() : null);
  // Stocks are off: only the two venues' trades. A source is lit by its poller's own last successful read: a quiet
  // stretch with no large bet (Nov 4: 22 minutes) isn't the poller falling behind. The newest stored bet is the note.
  const beats = h.rows as Array<{ job: string; last_ok_at: string | null }>;
  const POLLER: Record<"polymarket" | "kalshi", RegExp> = { polymarket: JOBS[0]![0], kalshi: JOBS[1]![0] };
  const sources: SourceFresh[] = (["polymarket", "kalshi"] as const).map(key => {
    const betAt = t(fr[key]);
    const reads = beats.filter(r => POLLER[key].test(r.job)).map(r => t(r.last_ok_at)).filter((x): x is number => x !== null);
    const readAt = reads.length ? Math.max(...reads) : null;
    const lastAt = readAt ?? betAt;
    const bet = betAt === null ? "no trade stored yet" : `latest trade ${ago(betAt, now)}`;
    return { key, label: LABELS[key], lastAt, light: lightOf(lastAt === null ? null : now - lastAt, LIMITS[key]),
      note: readAt !== null ? `Read ${ago(readAt, now)}; ${bet}` : betAt === null ? "Nothing stored yet" : `Latest seen ${ago(betAt, now)}` };
  });
  const jobs: JobBeat[] = [];
  for (const row of h.rows as Array<{ job: string; last_run_at: string; last_ok_at: string | null; ok: boolean; error: string | null }>) {
    const def = JOBS.find(([re]) => re.test(row.job));
    if (!def || jobs.some(j => j.label === def[1])) continue;
    const lastRunAt = new Date(row.last_run_at).getTime(), lastOkAt = t(row.last_ok_at);
    const light: Light = !row.ok ? "red" : now - lastRunAt > 3 * def[2] ? "amber" : "green";
    jobs.push({ job: row.job, label: def[1], lastRunAt, lastOkAt, ok: row.ok, error: row.error, light });
  }
  const bf = (h.rows as Array<{ job: string; last_run_at: string; stats: Record<string, number | string> | null }>).find(r => r.job === "moves:proven-backfill");
  const n = (k: string) => Number(bf?.stats?.[k] ?? 0);
  const backfill: BackfillRate | null = bf?.stats ? { at: new Date(bf.last_run_at).getTime(), wallets: n("wallets"), requests: n("requests"), reqPerSec: n("reqPerSec"),
    limitPerSec: n("limitPerSec"), share: n("share"), rateLimited: n("rateLimited"), queued: n("queued"), due: n("due") } : null;
  const checks = (c.rows as Array<{ run_at: string; ok: number; checked: number; mismatch: number }>).map(r => ({ runAt: new Date(r.run_at).getTime(), ok: Number(r.ok), checked: Number(r.checked), mismatch: Number(r.mismatch) }));
  const lights = [...sources.map(s => s.light), ...jobs.map(j => j.light)];
  const overall: Light = lights.includes("red") ? "red" : lights.includes("amber") ? "amber" : "green";
  const [since, latency] = await Promise.all([coverageSince(db, now).catch(() => null), alertLatency(db, now).catch(() => null)]);
  const sec = { since, alerts: latency?.alerts ?? 0, p50s: latency?.p50s ?? null, p95s: latency?.p95s ?? null };
  return { at: now, sources, jobs, backfill, checks, overall, sec,
    web: { startedAt: STARTED_AT, commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null, deployment: process.env.RAILWAY_DEPLOYMENT_ID ?? null } };
}
