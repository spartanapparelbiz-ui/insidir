/* /admin/metrics (owner only: the admin sign-in, lib/admin.ts): which account and which post bring paying users who
 * stay. One row per source (or per source and post), totals with D1/D7/D30 retention, the daily snapshots, and a CSV
 * of the view (lib/metrics/report.ts has every definition). */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { platformOfRef } from "@/lib/attribution";
import { getDb, hasDatabase } from "@/lib/db";
import { fmtPct, fmtUsd, metricsRows, metricsTotals, readWindow, recentSnapshots, type GroupBy, type MetricsRow, type MetricsTotals } from "@/lib/metrics/report";
import "../../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Metrics", robots: { index: false, follow: false } };

type Q = Record<string, string | string[] | undefined>;

export default async function MetricsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now())) {
    return <main className="wrap app adm"><h1 className="page__h">Metrics</h1><p className="muted">Sign in on <Link href="/admin">/admin</Link> first.</p></main>;
  }
  const q = await searchParams, now = Date.now();
  const w = readWindow(q, now);
  const by: GroupBy = q.by === "post" ? "post" : "source";
  let rows: MetricsRow[] = [], total: MetricsTotals | null = null, snaps: Awaited<ReturnType<typeof recentSnapshots>> = [], error = "";
  if (hasDatabase()) {
    try {
      const db = getDb();
      rows = await metricsRows(db, w, by, now);
      total = await metricsTotals(db, w, rows, now);
      snaps = await recentSnapshots(db, 30);
    } catch (e) { error = e instanceof Error ? e.message : "failed"; }
  }
  const qs = (extra: Record<string, string>) => new URLSearchParams({ from: w.from, to: w.to, by, ...extra }).toString();
  const label = (r: MetricsRow) => {
    const p = platformOfRef(r.source);
    return <>{r.source}{p ? <span className="muted"> ({p})</span> : null}{r.post !== null ? <span className="muted"> · {r.post}</span> : null}</>;
  };
  const cols = (r: MetricsRow) => (
    <>
      <td className="r">{r.visits}</td><td className="r">{r.signups}</td><td className="r">{r.trials}</td><td className="r">{r.paid}</td>
      <td className="r" title={`${r.converted} of ${r.trialsMatured} trials past their 3 days`}>{fmtPct(r.trialToPaid)}</td>
      <td className="r" title={`${r.paying} paying now`}>{fmtUsd(r.mrr)}</td>
      <td className="r" title={`${r.churned} cancelled or refunded in 30 days`}>{fmtPct(r.churn30)}</td>
      <td className="r" title={`${r.activated} of ${r.signups} signups`}>{fmtPct(r.activation)}</td>
    </>
  );
  return (
    <main className="wrap app adm" data-testid="admin-metrics">
      <div className="adm__top">
        <h1 className="page__h">Metrics: where paying users come from</h1>
        <nav className="small adm__nav" aria-label="Window">
          {[7, 30, 90].map(d => <a key={d} href={`/admin/metrics?days=${d}&by=${by}`}>{d}d</a>)}
          <a href={`/admin/metrics?${qs({ by: "source" })}`} aria-current={by === "source" ? "true" : undefined}>By account</a>
          <a href={`/admin/metrics?${qs({ by: "post" })}`} aria-current={by === "post" ? "true" : undefined}>By post</a>
          <a href={`/admin/metrics/csv?${qs({})}`} data-testid="metrics-csv">CSV</a>
          <Link href="/admin">Back to admin</Link>
        </nav>
      </div>
      <form className="small adm__nav" method="get" action="/admin/metrics">
        <label>From <input type="date" name="from" defaultValue={w.from} /></label>{" "}
        <label>To <input type="date" name="to" defaultValue={w.to} /></label>{" "}
        <input type="hidden" name="by" value={by} />
        <button type="submit">Show</button>
      </form>
      {error ? <p className="muted">Couldn&apos;t read the numbers: {error}</p> : null}
      {total ? (
        <section className="block" data-testid="metrics-totals">
          <h2 className="block__h">Totals, {w.from} to {w.to} (ET)</h2>
          <table className="table"><tbody>
            <tr><td>MRR now</td><td className="r" data-testid="metrics-mrr">{fmtUsd(total.mrr)}</td></tr>
            <tr><td>Paying members now</td><td className="r" data-testid="metrics-paying">{total.paying}</td></tr>
            <tr><td>Trial → paid</td><td className="r">{fmtPct(total.trialToPaid)} <span className="muted">({total.converted} of {total.trialsMatured})</span></td></tr>
            <tr><td>D1 / D7 / D30 retention</td><td className="r" data-testid="metrics-retention">{fmtPct(total.retention.d1)} / {fmtPct(total.retention.d7)} / {fmtPct(total.retention.d30)} <span className="muted">(n {total.retention.n1} / {total.retention.n7} / {total.retention.n30})</span></td></tr>
          </tbody></table>
        </section>
      ) : null}
      <section className="block" data-testid="metrics-table">
        <h2 className="block__h">{by === "post" ? "By account and post" : "By account"}</h2>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>{by === "post" ? "Account · post" : "Account"}</th><th className="r">Visits</th><th className="r">Signups</th><th className="r">Trials</th><th className="r">Paid</th><th className="r">Trial → paid</th><th className="r">MRR</th><th className="r">30-day churn</th><th className="r">Activation</th></tr></thead>
            <tbody>
              {rows.map(r => <tr key={r.key} data-testid="metrics-row" data-source={r.key}><td>{label(r)}</td>{cols(r)}</tr>)}
              {total ? <tr data-testid="metrics-total"><td><strong>Total</strong></td>{cols(total)}</tr> : null}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Account: ?ref= (bio links /tt1, /ig1, /x1 …), else utm_source, else the referring site, else direct; first touch. Post: utm_content.
          Visits are new visitors. Trial → paid counts trials past their 3 days. MRR counts members past the $1 trial who aren&apos;t set to cancel.
          Churn: of members paying in the last 30 days, the share that cancelled or were refunded. Activation: followed 2+ wallets in their first
          24 hours, opened the Daily Brief, or clicked an alert. Free-access accounts are left out.
        </p>
      </section>
      <section className="block" data-testid="metrics-daily">
        <h2 className="block__h">Daily snapshots</h2>
        {snaps.length ? (
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Day</th><th className="r">Visits</th><th className="r">Signups</th><th className="r">Trials</th><th className="r">Paid</th><th className="r">Paying</th><th className="r">MRR</th></tr></thead>
            <tbody>{snaps.map(s => <tr key={s.day}><td>{s.day}</td><td className="r">{s.visits}</td><td className="r">{s.signups}</td><td className="r">{s.trials}</td><td className="r">{s.paid}</td><td className="r">{s.paying}</td><td className="r">{fmtUsd(s.mrr)}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted small">The first snapshot is written after midnight ET.</p>}
      </section>
    </main>
  );
}
