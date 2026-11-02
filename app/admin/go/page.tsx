/* /admin/go: the /go funnel per UTM source (lib/go/funnel.ts): hook → each quiz step → aha → paywall → checkout
 * opened → paid → still paid after the trial, with the drop-off from the step before and the median time on each;
 * ping opt-in and pings per member per day. Behind the admin sign-in, like /admin. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { getDb, hasDatabase } from "@/lib/db";
import { GO_LABEL, GO_STEPS, goFunnel, pingStats, type GoRow, type PingStats } from "@/lib/go/funnel";
import "../../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "/go funnel", robots: { index: false, follow: false } };

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "");
const secs = (ms: number | null) => (ms === null ? "" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${(ms / 60_000).toFixed(1)}m`);

export default async function GoFunnelPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now())) {
    return <main className="wrap app adm"><h1 className="page__h">/go funnel</h1><p className="muted">Sign in on <Link href="/admin">/admin</Link> first.</p></main>;
  }
  const q = (await searchParams).days, days = q === "1" ? 1 : q === "30" ? 30 : 7, now = Date.now();
  let rows: GoRow[] = [], pings: PingStats | null = null, error = false;
  if (hasDatabase()) { try { [rows, pings] = await Promise.all([goFunnel(getDb(), new Date(now - days * 86_400_000), now), pingStats(getDb(), now)]); } catch { error = true; } }
  return (
    <main className="wrap app adm" data-testid="admin-go">
      <div className="adm__top">
        <h1 className="page__h">/go funnel by source</h1>
        <nav className="small adm__nav" aria-label="Window">{[1, 7, 30].map(d => <a key={d} href={`/admin/go?days=${d}`} aria-current={days === d ? "true" : undefined}>{d}d</a>)}<Link href="/admin">Back to admin</Link></nav>
      </div>
      {error ? <p className="muted">Couldn&apos;t read the funnel right now.</p> : null}
      {!rows.length && !error ? <p className="muted" data-testid="admin-go-none">No /go visits in this window yet.</p> : null}
      {rows.map(r => {
        const hook = r.steps.hook?.visitors ?? 0;
        return (
          <section key={r.source} className="adm__sec" data-testid={`admin-go-${r.source}`}>
            <h2>{r.source}</h2>
            <table className="adm__table">
              <thead><tr><th>Step</th><th>Visitors</th><th>From the step before</th><th>Drop-off</th><th>Median time on it</th></tr></thead>
              <tbody>
                {GO_STEPS.map((s, i) => {
                  const n = r.steps[s]?.visitors ?? 0, prev = i ? r.steps[GO_STEPS[i - 1]!]?.visitors ?? 0 : n;
                  return <tr key={s}><td>{GO_LABEL[s]}</td><td>{n}</td><td>{i ? pct(n, prev) : ""}</td><td>{i && prev ? pct(prev - n, prev) : ""}</td><td>{secs(r.steps[s]?.medianMs ?? null)}</td></tr>;
                })}
                <tr><td>Paid</td><td>{r.paid}</td><td>{pct(r.paid, r.steps.checkout?.visitors ?? 0)}</td><td></td><td></td></tr>
                <tr><td>Still paid after the trial</td><td>{r.paidAfterTrial}</td><td>{pct(r.paidAfterTrial, r.paid)}</td><td></td><td></td></tr>
              </tbody>
            </table>
            <p className="muted small">{hook} visitors saw the hook. &ldquo;Still paid after the trial&rdquo; counts their accounts older than the trial on a paid plan and not set to cancel.</p>
          </section>
        );
      })}
      {pings ? (
        <section className="adm__sec" data-testid="admin-go-pings">
          <h2>Pings</h2>
          <p>{pings.optedIn} of {pings.members} members have push on ({pct(pings.optedIn, pings.members) || "0%"}). {pings.pingsPerMemberDay === null ? "No pings yet." : `${pings.pingsPerMemberDay.toFixed(1)} pings per opted-in member per day over the last 7 days.`}</p>
        </section>
      ) : null}
    </main>
  );
}
