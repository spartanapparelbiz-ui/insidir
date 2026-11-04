/* /admin/twins: every Polymarket ↔ Kalshi twin the worker found, for a person to approve before anything uses it.
 * Each row: both titles, the five checks (event, outcome, line, rules, close), the notes, the confidence and both close
 * dates. "Review" rows are the ambiguous ones (worded differently, a far close date, a different source); "Candidate"
 * rows passed every check exactly. Nothing reaches members until it is approved here. Admin only. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { getDb, hasDatabase } from "@/lib/db";
import { autoApproved, twinsForReview } from "@/lib/twins/store";
import { etBounds, etDay } from "@/lib/twins/daily";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Twins", robots: { index: false, follow: false } };

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const when = (d: Date | null) => (d ? `${DAY.format(d)} ET` : "no date");
const CHECKS = ["event", "outcome", "line", "rules", "close"] as const;

export default async function TwinsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; saved?: string; view?: string; day?: string }> }) {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now())) {
    return <main className="b-root"><section className="b-stage"><div className="b-stage__in"><h1 className="b-h2">Twins</h1><p className="b-sub">Sign in on <a className="s-link" href="/admin">/admin</a> first.</p></div></section></main>;
  }
  const sp = await searchParams;
  if (sp.view === "auto") {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") ? sp.day! : etDay(Date.now()).day;
    const { from, to } = etBounds(day);
    const rows = hasDatabase() ? await autoApproved(getDb(), from, to).catch(() => []) : [];
    const prev = etDay(from - 3_600_000).day, next = etDay(to + 3_600_000).day;
    return (
      <main className="b-root" data-testid="admin-twins-auto">
        <section className="b-stage"><div className="b-stage__in">
          <div className="b-head">
            <h1 className="b-h2">Approved themselves: {day}</h1>
            <p className="b-sub">{rows.length} {rows.length === 1 ? "twin" : "twins"} matched on all five fields from the venues&apos; structured data (game or race ids, outcome names, the line as a number, the resolution sources, the close times). Revoke sends one to denied; it never approves itself again unless the pair changes.</p>
            <p className="b-small">{sp.saved ? `Saved ${sp.saved}. ` : ""}<a className="s-link" href={`/admin/twins?view=auto&day=${prev}`}>← {prev}</a> · <a className="s-link" href={`/admin/twins?view=auto&day=${next}`}>{next} →</a> · <a className="s-link" href="/admin/twins">Pending</a></p>
          </div>
          <ol className="s-lockrows s-wrows" data-testid="twin-auto-rows">
            {rows.map(r => (
              <li key={r.polymarketId} data-testid="twin-auto-row" data-status={r.status}>
                <span>
                  <span className="s-strong">{r.polymarketTitle}</span> <span className="b-small">(Polymarket)</span><br />
                  <span className="s-strong">{r.kalshiTitle}</span> <span className="b-small">(Kalshi · <a className="s-link" href={r.kalshiUrl} target="_blank" rel="noopener noreferrer">open</a>)</span><br />
                  <span className="b-small">{r.auto?.kind ?? r.kind} · {Object.entries(r.auto?.fields ?? {}).map(([k, v]) => `${k} ${v === "match" ? "✓" : v}`).join(" · ")} · {r.status}</span>
                </span>
                {r.status === "approved" ? (
                  <form method="post" action="/api/admin/twins" className="b-ctas">
                    <input type="hidden" name="id" value={r.polymarketId} />
                    <input type="hidden" name="back" value={`/admin/twins?view=auto&day=${day}`} />
                    <button type="submit" name="action" value="deny" className="b-btn b-panel-pill" data-testid="twin-revoke">Revoke</button>
                  </form>
                ) : <span className="b-small">Revoked</span>}
              </li>
            ))}
          </ol>
          {rows.length ? null : <p className="b-empty b-center">None approved themselves on {day}.</p>}
        </div></section>
      </main>
    );
  }
  const status = sp.status === "approved" || sp.status === "denied" ? sp.status : "pending";
  const rows = hasDatabase() ? await twinsForReview(getDb(), status).catch(() => []) : [];
  const candidates = rows.filter(r => r.verdict === "candidate");
  return (
    <main className="b-root" data-testid="admin-twins">
      <section className="b-stage"><div className="b-stage__in">
        <div className="b-head">
          <h1 className="b-h2">Twins: {status}</h1>
          <p className="b-sub">A twin is shown only after it is approved here. It needs the same event, outcome, line, resolution source and close date. Review rows are ambiguous; candidate rows passed every check.</p>
          <p className="b-small">{sp.saved ? `Saved ${sp.saved}. ` : ""}<a className="s-link" href="/admin/twins">Pending</a> · <a className="s-link" href="/admin/twins?status=approved">Approved</a> · <a className="s-link" href="/admin/twins?status=denied">Denied</a> · <a className="s-link" href="/admin/twins?view=auto">Approved themselves</a></p>
        </div>
        {status === "pending" && candidates.length ? (
          <form method="post" action="/api/admin/twins" className="b-center">
            {candidates.map(r => <input key={r.polymarketId} type="hidden" name="id" value={r.polymarketId} />)}
            <button type="submit" name="action" value="approve-candidates" className="b-btn b-btn-lg b-primary">Approve all {candidates.length} exact candidates</button>
          </form>
        ) : null}
        <ol className="s-lockrows s-wrows" data-testid="twin-rows">
          {rows.map(r => (
            <li key={r.polymarketId} data-testid="twin-row" data-verdict={r.verdict}>
              <span>
                <span className="s-strong">{r.polymarketTitle}</span> <span className="b-small">(Polymarket)</span><br />
                <span className="s-strong">{r.kalshiTitle}</span> <span className="b-small">(Kalshi · <a className="s-link" href={r.kalshiUrl} target="_blank" rel="noopener noreferrer">open</a>)</span><br />
                <span className="b-small">{r.verdict === "review" ? "Review" : "Candidate"} · {r.kind} · {Math.round(r.confidence * 100)}% · {CHECKS.map(c => `${c} ${r.checks[c] ? "✓" : "✗"}`).join(" · ")}</span><br />
                <span className="b-small">Closes: Polymarket {when(r.polymarketClose)}, Kalshi {when(r.kalshiClose)}{r.notes.length ? ` · ${r.notes.join(" · ")}` : ""}</span>
              </span>
              <form method="post" action="/api/admin/twins" className="b-ctas">
                <input type="hidden" name="id" value={r.polymarketId} />
                {status !== "approved" ? <button type="submit" name="action" value="approve" className="b-btn b-panel-pill">Approve</button> : null}
                {status !== "denied" ? <button type="submit" name="action" value="deny" className="b-btn b-panel-pill">{status === "approved" ? "Revoke" : "Deny"}</button> : null}
                {status !== "pending" ? <button type="submit" name="action" value="pending" className="b-btn b-panel-pill">Back to pending</button> : null}
              </form>
            </li>
          ))}
        </ol>
        {rows.length ? null : <p className="b-empty b-center">Nothing {status} right now.</p>}
      </div></section>
    </main>
  );
}
