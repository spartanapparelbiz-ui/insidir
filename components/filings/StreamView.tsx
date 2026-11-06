"use client";
/* The Cluster & Whale Stream (docs/RESEARCH-DESK.md §7): every rule match, one dense row each, computed at ingestion and
 * filtered and sorted here. Sorts are the member's choice of time, dollars or ticker, never a computed score. The
 * detail pane lists the code-P lines behind the match; each line expands inline to the Form 4's raw XML. */
import { Fragment, useCallback, useDeferredValue, useMemo, useState } from "react";
import { parseInput } from "@/lib/filings/calc";
import { day, etStamp, price, qty, usd } from "@/lib/filings/format";
import { VELOCITY_MIN, VELOCITY_MULTIPLE, WHALE_MIN } from "@/lib/filings/rules";
import type { AnomalyKind, AnomalyRow } from "@/lib/filings/types";
import { CodeBadge } from "./Bits";
import { api, useLocal } from "./hooks";
import { VTable } from "./VTable";

const KIND: Record<AnomalyKind, string> = { cluster: "Cluster", whale: "Whale", velocity: "Velocity" };
type Sort = "detected" | "value" | "ticker";
interface StreamFilter { kinds: AnomalyKind[]; mine: boolean; min: string; sort: Sort }
const START: StreamFilter = { kinds: ["cluster", "whale", "velocity"], mine: false, min: "", sort: "detected" };
const rowKey = (a: AnomalyRow) => String(a.id);
const HEAD = (
  <><span>Detected</span><span>Rule</span><span>Ticker</span><span className="fl-hide-sm">Company</span><span className="fl-n fl-hide-sm">Owners</span>
    <span className="fl-hide-sm">Trade window</span><span className="fl-n">Total as filed</span><span /></>
);

export function StreamView({ rows, watched, onPin }: { rows: AnomalyRow[] | null; watched: ReadonlySet<string>; onPin: (a: AnomalyRow) => void }) {
  const [f, setF] = useLocal<StreamFilter>("fl:stream:filter", START);
  const deferred = useDeferredValue(f);
  const out = useMemo(() => {
    const t0 = performance.now(), m = parseInput(deferred.min);
    const list = (rows ?? []).filter(a => deferred.kinds.includes(a.kind) && (!deferred.mine || watched.has(a.cik)) && (m === null || (a.total ?? 0) >= m));
    list.sort((a, b) => deferred.sort === "value" ? (b.total ?? -1) - (a.total ?? -1) : deferred.sort === "ticker" ? (a.ticker ?? a.company).localeCompare(b.ticker ?? b.company) : b.detectedAt - a.detectedAt);
    return { list, ms: Math.round((performance.now() - t0) * 10) / 10 };
  }, [rows, deferred, watched]);
  const [sel, setSel] = useState<string | null>(null);
  const selected = out.list.find(a => String(a.id) === sel) ?? null;
  const onSelect = useCallback((a: AnomalyRow) => setSel(String(a.id)), []);
  const render = useCallback((a: AnomalyRow) => (
    <>
      <span role="gridcell" className="fl-mono fl-dim" title={etStamp(a.detectedAt)}>{new Date(a.detectedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "")}</span>
      <span role="gridcell"><span className="fl-tag">{KIND[a.kind]}</span></span>
      <span role="gridcell" className="fl-tk">{a.ticker ?? "—"}</span>
      <span role="gridcell" className="fl-hide-sm" title={a.company}>{a.company}</span>
      <span role="gridcell" className="fl-n fl-hide-sm">{a.kind === "velocity" ? `${a.facts.count} F4` : a.facts.groups ?? 1}</span>
      <span role="gridcell" className="fl-mono fl-dim fl-hide-sm">{a.windowStart.slice(5)} → {a.windowEnd.slice(5)}</span>
      <span role="gridcell" className={`fl-n${a.total !== null ? " fl-p" : " fl-faint"}`}>{a.total !== null ? usd(a.total) : "–"}</span>
      <span role="gridcell" className="fl-faint">›</span>
    </>
  ), []);
  const toggle = (k: AnomalyKind) => setF({ ...f, kinds: f.kinds.includes(k) ? f.kinds.filter(x => x !== k) : [...f.kinds, k] });

  return (
    <div className={`fl-split${selected ? " has-sel" : ""}`} data-testid="fl-stream">
      <section className="fl-pane" aria-label="Cluster and Whale Stream">
        <div className="fl-pane__bar">
          <h2 className="fl-h">Cluster &amp; Whale Stream</h2>
          <span className="fl-faint">Form 4 filings matching three fixed rules. A match describes what was filed, not what a price will do.</span>
        </div>
        <div className="fl-filters" role="search" aria-label="Filter the Stream">
          {(Object.keys(KIND) as AnomalyKind[]).map(k => <button key={k} type="button" className="fl-chip" aria-pressed={f.kinds.includes(k)} onClick={() => toggle(k)}>{KIND[k]}</button>)}
          <span className="fl-filters__sep" />
          <button type="button" className="fl-chip" aria-pressed={f.mine} onClick={() => setF({ ...f, mine: !f.mine })}>My watchlists</button>
          <label className="fl-field fl-field--row"><span className="fl-label">Min $</span><input className="fl-in fl-in--n" inputMode="decimal" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} aria-label="Minimum total dollars" /></label>
          <label className="fl-field fl-field--row"><span className="fl-label">Sort</span>
            <select className="fl-in" value={f.sort} onChange={e => setF({ ...f, sort: e.target.value as Sort })}>
              <option value="detected">Newest first</option><option value="value">Largest total $</option><option value="ticker">Ticker A–Z</option>
            </select></label>
          <span className="fl-filters__meta" aria-live="polite">{out.list.length} / {rows?.length ?? 0} matches · {out.ms.toFixed(1)} ms</span>
        </div>
        <VTable rows={out.list} cols="fl-cols-stream" head={HEAD} render={render} rowKey={rowKey} selected={sel} onSelect={onSelect} label="Stream matches"
          empty={rows === null ? "Loading…" : rows.length ? "No matches with these filters." : "No filings have matched the rules yet."}
          footer={<details className="fl-more"><summary>How matches are found (rule v1)</summary>
            <p><b>Cluster:</b> 2+ separate reporting owners (owners on one filing count once) report code P purchases at one company with trade dates in the same Monday–Sunday week. Amendments are left out.</p>
            <p><b>Whale:</b> one Form 4 whose code P lines add up to {usd(WHALE_MIN)} or more, shares × price as filed.</p>
            <p><b>Velocity:</b> {VELOCITY_MIN}+ Form 4s accepted at one company in 7 days and at least {VELOCITY_MULTIPLE}× its usual weekly count since collection began (8 weeks needed). Often grants and exercises; codes are shown.</p>
          </details>} />
      </section>
      <aside className="fl-pane fl-pane--2" aria-label="Match detail">
        {selected ? <MatchDetail a={selected} pinned={watched.has(selected.cik)} onPin={() => onPin(selected)} onClose={() => setSel(null)} /> : <p className="fl-empty">Select a match to see the lines behind it.</p>}
      </aside>
    </div>
  );
}

function MatchDetail({ a, pinned, onPin, onClose }: { a: AnomalyRow; pinned: boolean; onPin: () => void; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [xml, setXml] = useState<Record<string, string>>({});
  const show = async (acc: string) => {
    if (open === acc) { setOpen(null); return; }
    setOpen(acc);
    if (!xml[acc]) {
      const text = await api<{ xml: string }>(`/api/filings/source/${acc}`).then(r => r.xml).catch((e: Error) => `(${e.message})`);
      setXml(x => ({ ...x, [acc]: text }));
    }
  };
  const fx = a.facts;
  return (
    <article className="fl-doc" data-testid="fl-match">
      <header className="fl-doc__head">
        <div className="fl-doc__title">
          <span className="fl-tag">{KIND[a.kind]}</span>
          <a className="fl-tk fl-link" href={`/filings/${encodeURIComponent(a.ticker ?? a.cik)}`}>{a.ticker ?? a.cik}</a>
          <span className="fl-dim">{a.company}</span>
          <button type="button" className="fl-x" aria-label="Close detail" onClick={onClose}>✕</button>
        </div>
        <dl className="fl-kv">
          <dt>Detected</dt><dd className="fl-mono">{etStamp(a.detectedAt)}</dd>
          <dt>Window</dt><dd className="fl-mono">{day(a.windowStart)} → {day(a.windowEnd)}</dd>
          {a.total !== null ? <><dt>Code P total</dt><dd className="fl-mono fl-p">{usd(a.total)} as filed</dd></> : null}
          {fx.groups ? <><dt>Owner groups</dt><dd className="fl-mono">{fx.groups}</dd></> : null}
          {a.kind === "velocity" ? <><dt>Form 4s</dt><dd className="fl-mono">{fx.count} in 7 days · prior weekly mean {fx.weeklyMean} over {fx.baselineWeeks} weeks</dd>
            <dt>Codes</dt><dd className="fl-codes">{Object.entries(fx.codes ?? {}).sort(([, x], [, y]) => y - x).map(([c, n]) => <span key={c} className="fl-row-gap"><CodeBadge code={c} /><span className="fl-mono fl-faint">×{n}</span></span>)}</dd></> : null}
          <dt>Rule</dt><dd className="fl-mono">v{a.ruleVersion}</dd>
        </dl>
        <div className="fl-row-gap"><button type="button" className="fl-btn fl-btn--ghost" disabled={pinned} onClick={onPin}>{pinned ? "On a watchlist" : "Pin to watchlist"}</button></div>
      </header>
      {fx.buys?.length ? (
        <div className="fl-pane__scroll">
          <table className="fl-lines">
            <thead><tr><th scope="col">Owner</th><th scope="col">Trade</th><th scope="col" className="fl-n">Shares</th><th scope="col" className="fl-n">Price</th><th scope="col" className="fl-n">Value</th><th scope="col"><span className="fl-sr">Source</span></th></tr></thead>
            <tbody>
              {fx.buys.map((b, i) => (
                <Fragment key={`${b.accession}-${i}`}>
                  <tr>
                    <td title={b.role}>{b.owners.join(" + ")}</td><td className="fl-mono">{b.date?.slice(5) ?? "–"}</td>
                    <td className="fl-n">{qty(b.shares)}</td><td className="fl-n">{price(b.price)}</td><td className="fl-n fl-p">{usd(b.value)}</td>
                    <td><button type="button" className="fl-x" aria-expanded={open === b.accession} onClick={() => void show(b.accession)}>{open === b.accession ? "XML ▾" : "XML ▸"}</button>
                      <a className="fl-x" href={b.url} target="_blank" rel="noopener noreferrer" aria-label="Open on sec.gov">↗</a></td>
                  </tr>
                  {open === b.accession && (i === 0 || fx.buys![i - 1]!.accession !== b.accession) ? (
                    <tr><td colSpan={6} className="fl-inline-drawer"><pre className="fl-xml" data-testid="fl-xml">{xml[b.accession] ?? "Loading the filing's XML…"}</pre></td></tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}
