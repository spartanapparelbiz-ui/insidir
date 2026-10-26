/* Admin: quarantined deals (held back as too good to be true or from pairs whose rules differ, never shown to users),
 * matches (both titles and rule texts side by side, with override actions), the funnel, the hero A/B test
 * and UTM results. Behind ADMIN_TOKEN + a TOTP code (lib/admin.ts). Read-only numbers straight from the database. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SafetyLight } from "@/components/SafetyLight";
import { ADMIN_COOKIE, adminConfigured, verifyAdminCookie } from "@/lib/admin";
import { abStats, funnelStats, sinceDays, utmStats, type AbRow, type FunnelRow } from "@/lib/analytics";
import { hasDatabase } from "@/lib/db";
import { pct, usd } from "@/lib/format";
import { pairViews, quarantineCount, quarantineViews, type PairView, type QuarantineView } from "@/lib/queries";
import type { VMarket } from "@/lib/types";
import { VENUE_NAME } from "@/lib/types";
import "../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const rate = (n: number, d: number): string => (d > 0 ? pct(n / d) : "—");

async function load<T>(fallback: T, run: () => Promise<T>): Promise<{ v: T; error: boolean }> {
  if (!hasDatabase()) return { v: fallback, error: false };
  try { return { v: await run(), error: false }; } catch { return { v: fallback, error: true }; }
}

function Side({ m, fallback }: { m: VMarket | null; fallback: string }) {
  return (
    <div className="rule">
      <p className="rule__venue">{m ? VENUE_NAME[m.venue] : fallback}</p>
      <p className="rule__h">{m?.title ?? "Market not stored"}</p>
      {m ? <div className="rule__text">{m.rules || "No rule text."}</div> : null}
    </div>
  );
}

function PairCard({ p }: { p: PairView }) {
  const { pair } = p;
  return (
    <article className="card adm-pair">
      <div className="adm-pair__top">
        <SafetyLight safety={pair.safety} />
        <span className="row-gap"><span className="tag">Matched by {pair.method}</span><span className="tag">{pct(pair.confidence, 0)} sure</span>{pair.inverted ? <span className="tag">Inverted</span> : null}{pair.blocked ? <span className="tag">Blocked</span> : null}</span>
      </div>
      {p.override ? <p className="small">Override: <b>{p.override.action}</b>.{p.override.note ? ` Note: ${p.override.note}` : ""}</p> : null}
      {pair.safetyNotes.length ? <ul className="notes">{pair.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
      <div className="rules rules--two">
        <Side m={p.a} fallback={`${pair.a.venue}:${pair.a.id}`} />
        <Side m={p.b} fallback={`${pair.b.venue}:${pair.b.id}`} />
      </div>
      <form method="post" action="/api/admin/overrides" className="adm-actions">
        <input type="hidden" name="key" value={pair.id} />
        <label className="check small"><input type="checkbox" name="inverted" defaultChecked={pair.inverted} />Inverted</label>
        <button className="btn btn--secondary" name="action" value="match">Force match</button>
        <button className="btn btn--secondary" name="action" value="block">Block</button>
        <select name="safety" className="input adm-select" defaultValue="" aria-label="Safety light">
          <option value="">Safety light</option><option value="green">Green</option><option value="yellow">Yellow</option><option value="red">Red</option>
        </select>
        <button className="btn btn--secondary" name="action" value="safety">Set safety</button>
        <input name="note" className="input adm-note" placeholder="Note (optional)" maxLength={500} />
        {p.override ? <button className="btn btn--ghost" name="action" value="clear">Clear override</button> : null}
      </form>
    </article>
  );
}

const when = (ms: number): string => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

function QuarantineCard({ q }: { q: QuarantineView }) {
  const o = q.opp;
  return (
    <article className="card adm-pair">
      <div className="adm-pair__top">
        <SafetyLight safety={o.safety} />
        <span className="dim tiny">{o.kind} · return {pct(o.roi)} · {usd(o.profit)} on {usd(o.cost + o.fees)} · first {when(q.firstSeenAt)} · last {when(q.lastSeenAt)}</span>
      </div>
      <p className="rule__h">{o.title}</p>
      <ul className="notes">{q.reasons.map((r, i) => <li key={i}><b>{r}</b></li>)}</ul>
      {o.safetyNotes.length ? <ul className="notes">{o.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
      <ul className="small">{o.legs.map((l, i) => (
        <li key={i}>{l.label} at {(l.avgPrice * 100).toFixed(1)}¢ × {l.contracts.toLocaleString("en-US")} {l.url ? <a href={l.url} target="_blank" rel="noreferrer">open on {VENUE_NAME[l.venue]}</a> : null}</li>
      ))}</ul>
      {q.markets.length <= 4 ? (
        <div className={`rules${q.markets.length === 2 ? " rules--two" : ""}`}>
          {q.markets.map((m, i) => <Side key={i} m={m} fallback={`${o.legs[i]?.venue}:${o.legs[i]?.marketId}`} />)}
        </div>
      ) : <p className="dim tiny">{q.markets.length} outcome markets; rules not shown.</p>}
    </article>
  );
}

function Funnel({ rows }: { rows: FunnelRow[] }) {
  return (
    <table className="table">
      <thead><tr><th>Step</th><th className="r">Visitors</th><th className="r">From previous</th><th className="r">From first</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.name}><td>{r.name}</td><td className="r">{r.visitors.toLocaleString("en-US")}</td>
          <td className="r">{i ? rate(r.visitors, rows[i - 1]?.visitors ?? 0) : "—"}</td><td className="r">{i ? rate(r.visitors, rows[0]?.visitors ?? 0) : "—"}</td></tr>
      ))}</tbody>
    </table>
  );
}

function Ab({ rows }: { rows: AbRow[] }) {
  return (
    <table className="table">
      <thead><tr><th>Variant</th><th className="r">Landing</th><th className="r">To feed</th><th className="r">To checkout</th><th className="r">Paid</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.variant}><td>{r.variant}</td><td className="r">{r.landing}</td>
          <td className="r">{r.feed} <span className="muted">({rate(r.feed, r.landing)})</span></td>
          <td className="r">{r.checkout} <span className="muted">({rate(r.checkout, r.landing)})</span></td>
          <td className="r">{r.paid} <span className="muted">({rate(r.paid, r.landing)})</span></td></tr>
      ))}</tbody>
    </table>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const jar = await cookies();
  const signedIn = verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now());
  const error = typeof q.error === "string" ? (q.error === "wait" ? "Too many attempts. Wait 15 minutes." : q.error.slice(0, 200)) : null;

  if (!signedIn) {
    return (
      <main className="wrap app adm-login">
        <h1 className="page__h">Admin</h1>
        {!adminConfigured() ? <p className="banner banner--err">Admin isn&apos;t set up. Set ADMIN_TOKEN (32 or more characters) and ADMIN_TOTP_SECRET (base32), then restart.</p> : null}
        <form method="post" action="/api/admin/login" className="card fs">
          <div className="field"><label htmlFor="a-token">Admin token</label><input id="a-token" name="token" type="password" className="input" autoComplete="current-password" required /></div>
          <div className="field"><label htmlFor="a-code">Authenticator code</label><input id="a-code" name="code" className="input" inputMode="numeric" pattern="[0-9 ]{6,7}" autoComplete="one-time-code" required /></div>
          {error ? <p className="err small" role="alert">{error}</p> : null}
          <button type="submit" className="btn btn--primary btn--block">Sign in</button>
        </form>
      </main>
    );
  }

  const days = q.days === "30" ? 30 : 7;
  const since = sinceDays(days);
  const [held, heldTotal, pairs, funnel, ab, utm] = await Promise.all([
    load<QuarantineView[]>([], () => quarantineViews(100)),
    load<number>(0, () => quarantineCount()),
    load<PairView[]>([], () => pairViews(200)),
    load<FunnelRow[]>([], () => funnelStats(since)),
    load<AbRow[]>([], () => abStats(since)),
    load<Awaited<ReturnType<typeof utmStats>>>([], () => utmStats()),
  ]);
  const anyError = held.error || pairs.error || funnel.error || ab.error || utm.error;
  return (
    <main className="wrap app adm">
      <div className="adm__top">
        <h1 className="page__h">Admin</h1>
        <form method="post" action="/api/admin/logout"><button className="btn btn--ghost">Sign out</button></form>
      </div>
      <nav className="adm__nav small" aria-label="Sections"><a href="#quarantine">Quarantine</a><a href="#matches">Matches</a><a href="#funnel">Funnel</a><a href="#ab">A/B</a><a href="#utm">UTM</a></nav>
      {!hasDatabase() ? <p className="banner banner--err">No database. Set DATABASE_URL, then restart.</p> : null}
      {anyError ? <p className="banner banner--err">Some numbers couldn&apos;t be read from the database. Reload to try again.</p> : null}
      {q.saved ? <p className="banner" role="status">Saved. The matcher applies it on its next run.</p> : null}
      {error ? <p className="banner banner--err" role="alert">{error}</p> : null}

      <section id="quarantine" className="sec2">
        <h2 className="sec2__h">Quarantine <span className="dim small">({heldTotal.v}{heldTotal.v > held.v.length ? `, latest ${held.v.length} shown` : ""})</span></h2>
        <p className="muted small">Held back from users, alerts and the public log: a return above 15%, more than $50 kept at $500, or a pair whose rules differ in date, threshold, source or how a tie settles.</p>
        {held.v.length ? <div className="adm-pairs">{held.v.map(q => <QuarantineCard key={q.opp.id} q={q} />)}</div> : <p className="muted small">Nothing quarantined.</p>}
      </section>

      <section id="matches" className="sec2">
        <h2 className="sec2__h">Matches <span className="muted small num">{pairs.v.length}</span></h2>
        {pairs.v.length ? <div className="adm-pairs">{pairs.v.map(p => <PairCard key={p.pair.id} p={p} />)}</div> : <p className="muted small">No pairs stored yet. The worker stores them on its next sweep.</p>}
      </section>

      <section id="funnel" className="sec2">
        <div className="adm__top">
          <h2 className="sec2__h">Funnel, last {days} days</h2>
          <nav className="small adm__nav" aria-label="Window"><a href="/admin?days=7#funnel" aria-current={days === 7 ? "true" : undefined}>7d</a><a href="/admin?days=30#funnel" aria-current={days === 30 ? "true" : undefined}>30d</a></nav>
        </div>
        {funnel.v.length ? <div className="scroll-x"><Funnel rows={funnel.v} /></div> : <p className="muted small">No events.</p>}
      </section>

      <section id="ab" className="sec2">
        <h2 className="sec2__h">Hero A/B test, last {days} days</h2>
        {ab.v.length ? <div className="scroll-x"><Ab rows={ab.v} /></div> : <p className="muted small">No landing views with a variant.</p>}
      </section>

      <section id="utm" className="sec2">
        <h2 className="sec2__h">UTM sources, all time</h2>
        {utm.v.length ? (
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Source</th><th>Campaign</th><th>Content</th><th className="r">Signups</th><th className="r">Paid</th><th className="r">Rate</th></tr></thead>
              <tbody>{utm.v.map((r, i) => <tr key={i}><td>{r.source}</td><td>{r.campaign}</td><td>{r.content}</td><td className="r">{r.signups}</td><td className="r">{r.paid}</td><td className="r">{rate(r.paid, r.signups)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="muted small">No signups.</p>}
      </section>
    </main>
  );
}
