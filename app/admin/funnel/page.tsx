/* /admin/funnel: the sign-up funnel by day (lib/analytics.ts FUNNEL_STEPS): landing view → CTA click → /start view →
 * account created → payment started → paid → onboarding done → first follow, with the drop-off between each step.
 * Free-access accounts are left out. Each person counts once per step, on the (Eastern) day they
 * first got there; totals and step-to-step rates on top. Behind the admin sign-in, like /admin. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { dropOff, FUNNEL, FUNNEL_LABEL, funnelByDay, sinceDays, type FunnelDay } from "@/lib/analytics";
import { hasDatabase } from "@/lib/db";
import { pct } from "@/lib/format";
import "../../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Funnel", robots: { index: false, follow: false } };

export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now())) {
    return (
      <main className="wrap app adm">
        <h1 className="page__h">Funnel</h1>
        <p className="muted">Sign in on <Link href="/admin">/admin</Link> first.</p>
      </main>
    );
  }
  const q = (await searchParams).days;
  const days = q === "90" ? 90 : q === "7" ? 7 : 30;
  let rows: FunnelDay[] = [], error = false;
  if (hasDatabase()) { try { rows = await funnelByDay(sinceDays(days)); } catch { error = true; } }
  const total = Object.fromEntries(FUNNEL.map(n => [n, rows.reduce((s, r) => s + (r.counts[n] ?? 0), 0)])) as Record<string, number>;
  const rate = (a: number, b: number) => (b > 0 ? pct(a / b) : "—");
  return (
    <main className="wrap app adm">
      <div className="adm__top">
        <h1 className="page__h">Funnel by day</h1>
        <nav className="small adm__nav" aria-label="Window">
          {[7, 30, 90].map(d => <a key={d} href={`/admin/funnel?days=${d}`} aria-current={days === d ? "true" : undefined}>{d}d</a>)}
          <Link href="/admin">Back to admin</Link>
        </nav>
      </div>
      {!hasDatabase() ? <p className="banner banner--err">No database. Set DATABASE_URL, then restart.</p> : null}
      {error ? <p className="banner banner--err">The events couldn&apos;t be read. Reload to try again.</p> : null}
      <p className="muted small">People reaching each step, counted once, on the Eastern day they first got there. Last {days} days.</p>
      <div className="scroll-x">
        <table className="table funnel">
          <thead><tr><th>Day</th>{FUNNEL.map(n => <th key={n} className="r">{FUNNEL_LABEL[n]}</th>)}</tr></thead>
          <tbody>
            <tr className="funnel__total"><th scope="row">Total</th>{FUNNEL.map(n => <td key={n} className="r">{total[n]!.toLocaleString("en-US")}</td>)}</tr>
            <tr className="funnel__rate"><th scope="row">From previous step</th>{FUNNEL.map((n, i) => <td key={n} className="r muted">{i === 0 ? "—" : rate(total[n]!, total[FUNNEL[i - 1]!]!)}</td>)}</tr>
            <tr className="funnel__drop" data-testid="funnel-drop"><th scope="row">Drop-off</th>{FUNNEL.map((n, i) => { const d = i === 0 ? null : dropOff(total[n]!, total[FUNNEL[i - 1]!]!); return <td key={n} className="r">{d === null ? "—" : pct(d)}</td>; })}</tr>
            {rows.length ? rows.map(r => (
              <tr key={r.day}><th scope="row">{r.day}</th>{FUNNEL.map(n => <td key={n} className="r">{(r.counts[n] ?? 0).toLocaleString("en-US")}</td>)}</tr>
            )) : <tr><td colSpan={FUNNEL.length + 1} className="muted">No events in this window yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
