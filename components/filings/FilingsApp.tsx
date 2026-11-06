"use client";
/* Filings (docs/RESEARCH-DESK.md): the member's SEC research desk, inside the site's own header (components/brand/app
 * Shell keeps the logo and nav). Views: Alerts (watched companies' Form 4 and 8-K, live), Stream, Watchlists, Journal,
 * Positions, and the company report. The research disclaimer is under every view and must be accepted once per
 * version before the desk opens. */
import { useEffect, useMemo, useState } from "react";
import { RESEARCH_DISCLAIMER, RESEARCH_DISCLAIMER_V } from "@/lib/copy";
import type { AnomalyRow } from "@/lib/filings/types";
import { FilingItem, Freshness, ResearchFoot } from "./Bits";
import { CompanyView } from "./CompanyView";
import { useMember, useStream, useWatchedFeed } from "./hooks";
import { PositionsDesk } from "./PositionsDesk";
import { StreamView } from "./StreamView";
import { TickerSearch } from "./TickerSearch";
import { WatchlistsView } from "./WatchlistsView";

export type View = "alerts" | "stream" | "watchlists" | "journal" | "positions";
const VIEWS: Array<[View, string]> = [["alerts", "Alerts"], ["stream", "Stream"], ["watchlists", "Watchlists"], ["journal", "Journal"], ["positions", "Positions"]];
const STATUS_COLS: Array<[string, string]> = [["researching", "Researching"], ["watching", "Watching"], ["passed", "Passed"], ["none", "No status"]];

export function FilingsApp({ initialView = "alerts", company }: { initialView?: View; company?: { cik: string; ticker: string; title: string } }) {
  const m = useMember();
  const [view, setView] = useState<View>(initialView);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const s = m.state;
  const watched = useMemo(() => new Set((s?.watchlists ?? []).flatMap(l => l.items.map(i => i.cik))), [s?.watchlists]);
  const held = useMemo(() => new Set((s?.positions ?? []).filter(p => p.exitPrice === null && p.resolution === null).flatMap(p => p.tickers)), [s?.positions]);
  const acked = s?.ackVersion === RESEARCH_DISCLAIMER_V;
  const feed = useWatchedFeed(watched, Boolean(s && acked));
  const stream = useStream(Boolean(s && acked && view === "stream" && !company));
  const unread = feed.rows.filter(r => r.id > (s?.seenId ?? 0)).length;

  // A toast for new watched filings, 6 seconds.
  useEffect(() => { if (!feed.fresh.length) return; const t = setTimeout(feed.clearFresh, 6000); return () => clearTimeout(t); }, [feed.fresh, feed.clearFresh]);

  const pin = (cik: string, ticker: string | null) => {
    if (!s || !ticker || watched.has(cik)) return;
    const lists = s.watchlists.length ? s.watchlists : [{ id: -Date.now(), name: "My watchlist", items: [] }];
    m.setWatchlists(lists.map((l, i) => (i === 0 ? { ...l, items: [...l.items, { cik, ticker }] } : l)));
  };

  if (m.error && !s) return <div className="fl-root"><p className="fl-empty" role="alert">{m.error}</p><ResearchFoot /></div>;
  if (!s) return <div className="fl-root" aria-busy="true"><p className="fl-small">Loading your desk…</p><ResearchFoot /></div>;
  if (!acked) return <div className="fl-root"><Notice onAccept={() => m.acknowledge(RESEARCH_DISCLAIMER_V)} /><ResearchFoot /></div>;

  return (
    <div className="fl-root" data-testid="fl-app">
      <header className="fl-bar">
        <h1 className="fl-h1"><a className="fl-link" href="/filings">Filings</a></h1>
        <TickerSearch onPick={h => { window.location.href = `/filings/${encodeURIComponent(h.ticker)}`; }} />
        <Freshness lastOk={feed.lastOk} failing={feed.failing} now={now} />
        <a className="fl-bell" href="/filings" aria-label={`${unread} unread alerts`} onClick={e => { if (!company) { e.preventDefault(); setView("alerts"); } }}>
          Alerts{unread ? <span className="fl-bell__n" data-testid="fl-unread">{unread > 99 ? "99+" : unread}</span> : null}
        </a>
      </header>
      {!company ? (
        <nav className="fl-tabs" aria-label="Filings views">
          {VIEWS.map(([v, label]) => <button key={v} type="button" className={`fl-tab${view === v ? " is-on" : ""}`} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>{label}</button>)}
        </nav>
      ) : null}

      {feed.fresh.length ? (
        <div className="fl-toast" role="status" data-testid="fl-toast">
          {feed.fresh.length === 1 ? `${feed.fresh[0]!.ticker ?? feed.fresh[0]!.company} · Form ${feed.fresh[0]!.form}` : `${feed.fresh.length} new filings on your watchlists`}
        </div>
      ) : null}

      {company ? (
        <CompanyView cik={company.cik} ticker={company.ticker} title={company.title} pinned={watched.has(company.cik)} onPin={() => pin(company.cik, company.ticker)}
          onJournal={m.journalTouched} held={held.has(company.ticker)} />
      ) : view === "alerts" ? (
        <section aria-labelledby="fl-alerts-h" data-testid="fl-alerts">
          <div className="fl-head">
            <h2 id="fl-alerts-h" className="fl-h2">Alerts</h2>
            <p className="fl-sub">Every Form 4 and 8-K from your watchlists, last 7 days, newest first. New ones appear within about a minute of reaching Insidir.</p>
            {unread ? <button type="button" className="fl-btn fl-btn--ghost" onClick={() => void m.markSeen(Math.max(...feed.rows.map(r => r.id)))}>Mark all read</button> : null}
          </div>
          {!watched.size ? <p className="fl-empty">Pin tickers in Watchlists and their filings will appear here.</p>
            : !feed.rows.length ? <p className="fl-empty">No Form 4 or 8-K from your watchlists in the last 7 days.</p> : (
              <ul className="fl-list">{feed.rows.map(f => <FilingItem key={f.id} f={f} unread={f.id > s.seenId} held={Boolean(f.ticker && held.has(f.ticker))} />)}</ul>
            )}
        </section>
      ) : view === "stream" ? (
        <StreamView rows={stream} watched={watched} onPin={(a: AnomalyRow) => pin(a.cik, a.ticker)} />
      ) : view === "watchlists" ? (
        <WatchlistsView lists={s.watchlists} setLists={m.setWatchlists} save={m.listSave} rows={feed.rows} journals={s.journals} />
      ) : view === "journal" ? (
        <section aria-labelledby="fl-jb-h" data-testid="fl-journal-board">
          <div className="fl-head">
            <h2 id="fl-jb-h" className="fl-h2">Journal</h2>
            <p className="fl-sub">Your status and notes on each company. Private to you. <a className="fl-link" href="/api/filings/export">Download all your research (JSON)</a></p>
          </div>
          {!s.journals.length ? <p className="fl-empty">Open a company and add a note or a status to start your journal.</p> : (
            <div className="fl-board">
              {STATUS_COLS.map(([k, label]) => {
                const col = s.journals.filter(j => (j.status ?? "none") === k);
                return (
                  <div key={k} className="fl-board__col">
                    <h3 className="fl-h3">{label} <span className="fl-small">{col.length}</span></h3>
                    <ul className="fl-list">{col.map(j => (
                      <li key={j.cik} className="fl-row"><div className="fl-row__main">
                        <a className="fl-link fl-mono" href={`/filings/${encodeURIComponent(j.ticker)}`}>{j.ticker}</a>
                        <p className="fl-small">{j.notes} notes · updated {new Date(j.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      </div></li>
                    ))}</ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <PositionsDesk positions={s.positions} save={m.setPositions} />
      )}
      <ResearchFoot />
    </div>
  );
}

/** The first-visit notice: the disclaimer in full and a required checkbox. */
function Notice({ onAccept }: { onAccept: () => Promise<void> }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fl-notice" role="dialog" aria-modal="true" aria-labelledby="fl-notice-h" data-testid="fl-notice">
      <h1 id="fl-notice-h" className="fl-h2">Before you start</h1>
      <ul className="fl-notice__list">
        <li>Public SEC records (Form 4 and 8-K), organised and linked to sec.gov.</li>
        <li>Your watchlists, notes and positions are private to you, and you can download them any time.</li>
        <li>Facts as filed only: Insidir gives no advice, forecasts or ratings, and never connects to a broker.</li>
      </ul>
      <p className="fl-notice__box">{RESEARCH_DISCLAIMER}</p>
      <label className="fl-toggle"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} data-testid="fl-notice-check" />I understand Insidir is research software, not investment advice.</label>
      {err ? <p className="fl-error" role="alert">{err}</p> : null}
      <button type="button" className="fl-btn" disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onAccept(); } catch (e) { setErr((e as Error).message); setBusy(false); } }}>Continue</button>
    </div>
  );
}
