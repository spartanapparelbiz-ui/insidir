"use client";
/* The Filings terminal (docs/RESEARCH-DESK.md): one full-viewport desk. Header: the Insidir logo exactly as the site
 * draws it, the ticker search (/), EDGAR's health from the poller's own heartbeat, this browser's link to the feed
 * (round trip measured on every poll; the feed is polled, not a socket, and says so), and a UTC clock. Tabs with
 * single-key shortcuts. Status bar: the research disclaimer, quietly, on every view.
 *
 * Shortcuts: / search · F filter · A alerts · W watchlists (pin) · T tape · S stream · J journal · P positions ·
 * N note on the open filing · ↑/↓ move · Enter open · ? keys · Esc close. */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/brand/Bits";
import { RESEARCH_DISCLAIMER, RESEARCH_DISCLAIMER_V } from "@/lib/copy";
import { mergeRows } from "@/lib/filings/filter";
import type { AnomalyRow, FilingRow } from "@/lib/filings/types";
import { AlertsView } from "./AlertsView";
import { Kbd, ResearchFoot } from "./Bits";
import { CompanyView } from "./CompanyView";
import { useHotkeys, useLiveFeed, useMember, useNow, useStream, useTape, useTickers, useWatchedHistory, type Link } from "./hooks";
import { PositionsDesk } from "./PositionsDesk";
import { StreamView } from "./StreamView";
import { TapeView } from "./TapeView";
import { TickerSearch } from "./TickerSearch";
import { VTable } from "./VTable";

export type View = "alerts" | "tape" | "stream" | "journal" | "positions";
const TABS: Array<[View, string, string]> = [["alerts", "Alerts", "A"], ["tape", "Tape", "T"], ["stream", "Stream", "S"], ["journal", "Journal", "J"], ["positions", "Positions", "P"]];
const KEYS: Array<[string, string]> = [["/", "Search a ticker"], ["F", "Filter the current table"], ["A", "Alerts"], ["W", "Watchlists: pin a ticker"], ["T", "Tape: every filing"],
  ["S", "Cluster & Whale Stream"], ["J", "Journal (on a company: write a note)"], ["P", "Position desk"], ["N", "Note on the open filing"], ["↑ ↓", "Move in a table"], ["Enter", "Open"], ["Esc", "Close"], ["?", "This list"]];

const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };

export function Terminal({ initialView = "alerts", company, noteFor = null }: { initialView?: View; company?: { cik: string; ticker: string; title: string }; noteFor?: string | null }) {
  const m = useMember();
  const s = m.state;
  const acked = s?.ackVersion === RESEARCH_DISCLAIMER_V;
  const [view, setViewState] = useState<View>(initialView);
  const [help, setHelp] = useState(false);
  const now = useNow(1000);
  const search = useRef<HTMLInputElement>(null), filter = useRef<HTMLInputElement>(null), pin = useRef<HTMLInputElement>(null), composer = useRef<HTMLTextAreaElement>(null);

  const feed = useLiveFeed(Boolean(s));
  const watched = useMemo(() => new Set((s?.watchlists ?? []).flatMap(l => l.items.map(i => i.cik))), [s?.watchlists]);
  const history = useWatchedHistory(watched, Boolean(s), feed.gapAt);
  const tape = useTape(feed.cursor, Boolean(s) && !company && view === "tape");
  const tapeRows = useMemo(() => (feed.live.length ? mergeRows(tape.rows, feed.live) : tape.rows), [tape.rows, feed.live]);
  const stream = useStream(Boolean(s) && !company && (view === "stream" || view === "alerts"));
  const velocityCiks = useMemo(() => new Set((stream ?? []).filter(a => a.kind === "velocity").map(a => a.cik)), [stream]);
  const held = useMemo(() => new Set((s?.positions ?? []).filter(p => p.exitPrice === null && p.resolution === null).flatMap(p => p.tickers)), [s?.positions]);
  const journals = useMemo(() => new Map((s?.journals ?? []).map(j => [j.cik, j.status])), [s?.journals]);
  const freshIds = useMemo(() => new Set(feed.fresh.map(f => f.id)), [feed.fresh]);
  const watchedFresh = feed.fresh.filter(f => watched.has(f.cik));
  const unread = useMemo(() => {
    const ids = new Set<number>();
    for (const f of history) if (f.id > (s?.seenId ?? 0)) ids.add(f.id);
    for (const f of feed.live) if (watched.has(f.cik) && f.id > (s?.seenId ?? 0)) ids.add(f.id);
    return ids.size;
  }, [history, feed.live, watched, s?.seenId]);
  useEffect(() => { if (!feed.fresh.length) return; const t = setTimeout(feed.clearFresh, 6000); return () => clearTimeout(t); }, [feed.fresh, feed.clearFresh]);

  const setView = useCallback((v: View) => {
    if (company) { window.location.href = `/filings?view=${v}`; return; }
    setViewState(v);
    try { const u = new URL(window.location.href); u.searchParams.set("view", v); window.history.replaceState(null, "", u); } catch { /* the URL stays */ }
  }, [company]);
  const pinTo = useCallback((cik: string, ticker: string | null) => {
    if (!s || !ticker || watched.has(cik)) return;
    const lists = s.watchlists.length ? s.watchlists : [{ id: -Date.now(), name: "Core", items: [] }];
    m.setWatchlists(lists.map((l, i) => (i === 0 ? { ...l, items: [...l.items, { cik, ticker }] } : l)));
  }, [s, watched, m]);
  const noteOn = useCallback((f: FilingRow) => { window.location.href = `/filings/${encodeURIComponent(f.ticker ?? f.cik)}?note=${f.accession}`; }, []);

  useHotkeys({
    "/": () => search.current?.focus(),
    f: () => filter.current?.focus(),
    a: () => setView("alerts"),
    t: () => setView("tape"),
    s: () => setView("stream"),
    p: () => setView("positions"),
    w: () => { if (company) { setView("alerts"); return; } setView("alerts"); setTimeout(() => pin.current?.focus(), 0); },
    j: () => { if (company) composer.current?.focus(); else setView("journal"); },
    "?": () => setHelp(h => !h),
    Escape: () => { setHelp(false); (document.activeElement as HTMLElement | null)?.blur(); },
  });

  const edgar = edgarLight(feed.edgar, now);
  const link = linkLight(feed.link, feed.rtt);
  const utc = now ? new Date(now).toISOString().slice(11, 19) : "--:--:--";

  return (
    <div className="fl-term" data-testid="fl-app">
      <header className="fl-head">
        <Logo />
        <span className="fl-head__sep" aria-hidden="true" />
        <span className="fl-head__name">EDGAR terminal</span>
        <div className="fl-head__search"><TickerSearch ref={search} hint="/" onPick={h => { window.location.href = `/filings/${encodeURIComponent(h.ticker)}`; }} /></div>
        <div className="fl-head__right">
          <span className="fl-light" role="status" title={edgar.title} data-testid="fl-edgar"><span className={`fl-dot fl-dot--${edgar.tone}`} />{edgar.label}</span>
          <span className="fl-light fl-light--feed" role="status" title={link.title} data-testid="fl-link"><span className={`fl-dot fl-dot--${link.tone}`} />{link.label}</span>
          <time className="fl-clock" dateTime={now ? new Date(now).toISOString() : undefined} aria-label="Coordinated Universal Time">{utc} UTC</time>
          <a className="fl-head__acct" href="/settings">Account</a>
        </div>
      </header>

      <nav className="fl-tabs" aria-label="Terminal views">
        {company ? <a className="fl-tab" aria-current="page" href={`/filings/${encodeURIComponent(company.ticker)}`}><span className="fl-tk">{company.ticker}</span></a> : null}
        {TABS.map(([v, label, key]) => (
          <button key={v} type="button" className="fl-tab" aria-current={!company && view === v ? "page" : undefined} onClick={() => setView(v)}>
            {label}{v === "alerts" && unread ? <span className="fl-tab__n" data-testid="fl-unread">{unread > 99 ? "99+" : unread}</span> : null}<Kbd k={key} />
          </button>
        ))}
        <div className="fl-tabs__end"><button type="button" className="fl-tab" onClick={() => setHelp(true)}>Keys <Kbd k="?" /></button></div>
      </nav>

      <main className="fl-body">
        {!s ? <p className="fl-empty" aria-busy="true">{m.error ?? "Loading your desk…"}</p>
          : company ? <CompanyView cik={company.cik} ticker={company.ticker} title={company.title} pinned={watched.has(company.cik)} onPin={() => pinTo(company.cik, company.ticker)}
              onJournal={m.journalTouched} held={held.has(company.ticker)} journalRef={composer} noteFor={noteFor} />
          : view === "alerts" ? <AlertsView lists={s.watchlists} setLists={m.setWatchlists} save={m.listSave} history={history} live={feed.live} seenId={s.seenId} markSeen={id => void m.markSeen(id)}
              velocityCiks={velocityCiks} held={held} freshIds={freshIds} onNote={noteOn} pinRef={pin} filterRef={filter} journals={journals} />
          : view === "tape" ? <TapeView rows={tapeRows} loadMore={() => void tape.loadMore()} loading={tape.loading} done={tape.done} held={held} freshIds={freshIds} onNote={noteOn} filterRef={filter} />
          : view === "stream" ? <StreamView rows={stream} watched={watched} onPin={(a: AnomalyRow) => pinTo(a.cik, a.ticker)} />
          : view === "journal" ? <JournalIndex journals={s.journals} />
          : <PositionsDesk positions={s.positions} save={m.setPositions} />}
      </main>

      <footer className="fl-status">
        <ResearchFoot />
        <span className="fl-status__meta">
          <span>cursor {feed.cursor || "–"}</span>
          <span>{feed.lastOk && now ? `polled ${ago(now - feed.lastOk)} ago` : "connecting"}</span>
          {feed.edgar?.lagP95Sec != null ? <span>EDGAR→Insidir p95 {feed.edgar.lagP95Sec}s</span> : null}
        </span>
      </footer>

      {watchedFresh.length ? (
        <div className="fl-toast" role="status" data-testid="fl-toast">
          <span className="fl-dot fl-dot--ok" />{watchedFresh.length === 1 ? `${watchedFresh[0]!.ticker ?? watchedFresh[0]!.company} · ${watchedFresh[0]!.form} filed` : `${watchedFresh.length} new filings on your watchlists`}
        </div>
      ) : null}
      {help ? <Help onClose={() => setHelp(false)} /> : null}
      {s && !acked ? <Notice onAccept={() => m.acknowledge(RESEARCH_DISCLAIMER_V)} /> : null}
    </div>
  );
}

/** EDGAR's light, from the poller's heartbeat: green when it read EDGAR in the last 3 minutes and succeeded. */
export function edgarLight(h: { lastRunAt: number | null; lastOkAt: number | null; ok: boolean | null } | null, now: number): { tone: "ok" | "warn" | "down" | "idle"; label: string; title: string } {
  if (!h || h.lastRunAt === null) return { tone: "idle", label: "EDGAR –", title: "No poll recorded yet" };
  const since = now - (h.lastOkAt ?? 0);
  if (h.ok === false) return { tone: "down", label: `EDGAR err ${h.lastOkAt ? ago(since) : ""}`.trim(), title: "The last EDGAR read failed; retrying every minute" };
  if (since > 3 * 60_000) return { tone: "warn", label: `EDGAR ${ago(since)}`, title: "No successful EDGAR read for over 3 minutes" };
  return { tone: "ok", label: `EDGAR ${ago(since)}`, title: "EDGAR read successfully by the poller" };
}

function linkLight(link: Link, rtt: number | null): { tone: "ok" | "warn" | "down" | "idle"; label: string; title: string } {
  if (link === "offline") return { tone: "down", label: "FEED offline", title: "This browser is offline" };
  if (link === "connecting") return { tone: "idle", label: "FEED –", title: "Connecting" };
  return { tone: link === "live" ? "ok" : "warn", label: `FEED ${rtt ?? "–"}ms`, title: "Polled every 15 s (60 s in a background tab); round trip of the last poll" };
}

function JournalIndex({ journals }: { journals: Array<{ cik: string; ticker: string; status: string | null; notes: number; updatedAt: number }> }) {
  const t = useTickers(true);
  const [sel, setSel] = useState<string | null>(null);
  const render = useCallback((j: (typeof journals)[number]) => (
    <>
      <span role="gridcell" className="fl-tk">{j.ticker}</span>
      <span role="gridcell" className="fl-dim">{t.byTicker.get(j.ticker)?.title ?? ""}</span>
      <span role="gridcell">{j.status ? <span className="fl-tag">{j.status}</span> : <span className="fl-faint">–</span>}</span>
      <span role="gridcell" className="fl-n fl-hide-sm">{j.notes}</span>
      <span role="gridcell" className="fl-n fl-faint fl-hide-sm">{new Date(j.updatedAt).toISOString().slice(0, 10)}</span>
    </>
  ), [t.byTicker]);
  return (
    <div className="fl-split" data-testid="fl-journal-board">
      <section className="fl-pane" aria-label="Your journal">
        <div className="fl-pane__bar"><h2 className="fl-h">Journal</h2><span className="fl-faint">Private to you. Open a company to write beside its filings.</span>
          <a className="fl-btn fl-btn--ghost" href="/api/filings/export">Export JSON</a></div>
        <VTable rows={journals} cols="fl-cols-journal" rowKey={j => j.cik} selected={sel} onSelect={j => setSel(j.cik)} onOpen={j => { window.location.href = `/filings/${encodeURIComponent(j.ticker)}`; }}
          head={<><span>Ticker</span><span>Company</span><span>Status</span><span className="fl-n fl-hide-sm">Notes</span><span className="fl-n fl-hide-sm">Updated</span></>}
          render={render} label="Companies in your journal" empty="No journal yet. Open a company and press J to write."
          footer={<p className="fl-more">Enter or double-click opens the company.</p>} />
      </section>
      <aside className="fl-pane fl-pane--2" aria-label="Status counts">
        <div className="fl-pane__bar"><h3 className="fl-h">By status</h3></div>
        <dl className="fl-kv fl-section">
          {(["researching", "watching", "passed"] as const).map(k => <Fragment key={k}><dt>{k}</dt><dd className="fl-mono">{journals.filter(j => j.status === k).length}</dd></Fragment>)}
          <dt>no status</dt><dd className="fl-mono">{journals.filter(j => !j.status).length}</dd>
        </dl>
        {sel ? <div className="fl-section"><a className="fl-btn" href={`/filings/${encodeURIComponent(journals.find(j => j.cik === sel)?.ticker ?? sel)}`}>Open {journals.find(j => j.cik === sel)?.ticker}</a></div> : null}
      </aside>
    </div>
  );
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="fl-overlay" role="dialog" aria-modal="true" aria-labelledby="fl-keys-h" onClick={onClose}>
      <div className="fl-dialog" onClick={e => e.stopPropagation()}>
        <div className="fl-pane__bar"><h2 id="fl-keys-h" className="fl-h">Keyboard</h2><button type="button" className="fl-x" onClick={onClose} aria-label="Close">✕</button></div>
        <dl className="fl-keys fl-dialog__body">{KEYS.map(([k, d]) => <Fragment key={k}><dt><Kbd k={k} /></dt><dd>{d}</dd></Fragment>)}</dl>
      </div>
    </div>
  );
}

/** The first visit (and each new disclaimer version): the disclaimer in full, a required checkbox. Not dismissable. */
function Notice({ onAccept }: { onAccept: () => Promise<void> }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fl-overlay">
      <div className="fl-dialog" role="dialog" aria-modal="true" aria-labelledby="fl-notice-h" data-testid="fl-notice">
        <div className="fl-pane__bar"><h2 id="fl-notice-h" className="fl-h">Before you open the terminal</h2></div>
        <div className="fl-dialog__body">
          <ul className="fl-history">
            <li>Public SEC EDGAR records (Form 4, 8-K), parsed as filed and linked to sec.gov.</li>
            <li>Watchlists, notes and positions are private to you, and exportable any time.</li>
            <li>Facts as filed only: no advice, forecasts or ratings; no broker connection.</li>
          </ul>
          <p className="fl-dialog__legal">{RESEARCH_DISCLAIMER}</p>
          <label className="fl-check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} data-testid="fl-notice-check" />I understand Insidir is research software, not investment advice.</label>
          {err ? <p className="fl-error" role="alert">{err}</p> : null}
          <div><button type="button" className="fl-btn" disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onAccept(); } catch (e) { setErr((e as Error).message); setBusy(false); } }}>Open the terminal</button></div>
        </div>
      </div>
    </div>
  );
}
