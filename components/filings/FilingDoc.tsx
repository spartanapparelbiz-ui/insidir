"use client";
/* One filing as a document: header with form, codes or items, both clocks and the sec.gov links; the reporting owners
 * and every non-derivative line as filed; and, on request, the raw ownership XML (fetched once through the server's
 * cache, shown as text, never interpreted). 8-Ks list their items with the SEC's titles. */
import { useEffect, useState } from "react";
import { codeLabel, itemLabel } from "@/lib/filings/codes";
import { day, etStamp, price, qty, usd } from "@/lib/filings/format";
import type { FilingRow } from "@/lib/filings/types";
import { CodeBadge, FormBadge, ItemBadge } from "./Bits";
import { api } from "./hooks";

export function FilingDoc({ f, onNote, held, onClose }: { f: FilingRow; onNote?: (f: FilingRow) => void; held?: boolean; onClose?: () => void }) {
  const [raw, setRaw] = useState<{ state: "idle" | "loading" | "done" | "error"; xml?: string; url?: string; error?: string }>({ state: "idle" });
  useEffect(() => { setRaw({ state: "idle" }); }, [f.accession]);
  const p = f.payload;
  const loadRaw = async () => {
    setRaw({ state: "loading" });
    try { const r = await api<{ xml: string; url: string }>(`/api/filings/source/${f.accession}`); setRaw({ state: "done", xml: r.xml, url: r.url }); }
    catch (e) { setRaw({ state: "error", error: (e as Error).message }); }
  };
  return (
    <article className="fl-doc" aria-label={`Filing ${f.accession}`} data-testid="fl-doc">
      <header className="fl-doc__head">
        <div className="fl-doc__title">
          <a className="fl-tk fl-link" href={`/filings/${encodeURIComponent(f.ticker ?? f.cik)}`}>{f.ticker ?? f.cik}</a>
          <FormBadge form={f.form} />
          <span className="fl-codes">{p.kind === "4" ? p.codes.map(c => <CodeBadge key={c} code={c} />) : p.items.map(i => <ItemBadge key={i} item={i} />)}</span>
          {held ? <span className="fl-tag fl-tag--hold">You log a position</span> : null}
          {onClose ? <button type="button" className="fl-x" aria-label="Close document" onClick={onClose}>✕</button> : null}
        </div>
        <span className="fl-dim">{f.company}</span>
        <dl className="fl-kv">
          <dt>Accession</dt><dd className="fl-mono">{f.accession.slice(0, 10)}-{f.accession.slice(10, 12)}-{f.accession.slice(12)}</dd>
          <dt>EDGAR accepted</dt><dd className="fl-mono">{etStamp(f.acceptedAt)}</dd>
          <dt>In Insidir</dt><dd className="fl-mono">{etStamp(f.detectedAt)}</dd>
          {p.kind === "4" ? <><dt>Reporting</dt><dd>{p.owners.map(o => <div key={`${o.cik}-${o.name}`}>{o.name} <span className="fl-faint">{o.role}{o.cik ? ` · CIK ${o.cik}` : ""}</span></div>)}</dd></> : null}
        </dl>
        <div className="fl-row-gap">
          <a className="fl-btn fl-btn--ghost" href={f.url} target="_blank" rel="noopener noreferrer">EDGAR index ↗</a>
          {p.kind === "4" ? <button type="button" className="fl-btn fl-btn--ghost" aria-expanded={raw.state === "done"} onClick={() => (raw.state === "done" ? setRaw({ state: "idle" }) : void loadRaw())}>
            {raw.state === "loading" ? "Loading XML…" : raw.state === "done" ? "Hide raw XML" : "Raw XML"}</button> : null}
          {onNote ? <button type="button" className="fl-btn fl-btn--ghost" onClick={() => onNote(f)}>+ Note <span className="fl-kbd">N</span></button> : null}
        </div>
      </header>

      {p.kind === "4" ? (
        <div className="fl-pane__scroll">
          {p.lines.length ? (
            <table className="fl-lines">
              <thead><tr><th scope="col">Code</th><th scope="col">A/D</th><th scope="col">Trade date</th><th scope="col" className="fl-n">Shares</th><th scope="col" className="fl-n">Price</th><th scope="col" className="fl-n">Value</th></tr></thead>
              <tbody>{p.lines.map((l, i) => (
                <tr key={i} title={codeLabel(l.code)}>
                  <td><CodeBadge code={l.code} /></td><td className="fl-mono">{l.ad ?? "–"}</td><td className="fl-mono">{day(l.date)}</td>
                  <td className="fl-n">{l.shares === null ? "–" : qty(l.shares)}</td><td className="fl-n">{l.price === null ? "–" : price(l.price)}</td>
                  <td className={`fl-n${l.code === "P" ? " fl-p" : l.code === "S" ? " fl-s" : ""}`}>{l.value === null ? "–" : usd(l.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="fl-empty">No non-derivative lines on this filing.</p>}
          {p.derivativeLines ? <p className="fl-more">{p.derivativeLines} derivative line{p.derivativeLines === 1 ? "" : "s"} (options, units) not listed. Open the filing for them.</p> : null}
          {raw.state === "error" ? <p className="fl-error">{raw.error}</p> : null}
          {raw.state === "done" && raw.xml ? (
            <>
              <p className="fl-more">Source: <a className="fl-link" href={raw.url} target="_blank" rel="noopener noreferrer">{raw.url}</a></p>
              <pre className="fl-xml" data-testid="fl-xml">{raw.xml}</pre>
            </>
          ) : null}
        </div>
      ) : (
        <div className="fl-pane__scroll">
          {p.items.length ? (
            <table className="fl-lines">
              <thead><tr><th scope="col">Item</th><th scope="col">Title (Form 8-K)</th></tr></thead>
              <tbody>{p.items.map(i => <tr key={i}><td><ItemBadge item={i} /></td><td className="fl-dim">{itemLabel(i)}</td></tr>)}</tbody>
            </table>
          ) : <p className="fl-empty">The EDGAR feed listed no item numbers for this 8-K. Open the index for its documents.</p>}
          <p className="fl-more">Filed {day(f.filedOn)}. The 8-K and its exhibits are on the EDGAR index.</p>
        </div>
      )}
    </article>
  );
}

const STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const lag = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };

/** One table row's cells for a filing, shared by the tape, alerts and company tables. */
export function FilingCells({ f, mode }: { f: FilingRow; mode: "tape" | "co" }) {
  const p = f.payload;
  const pv = p.kind === "4" ? p.lines.filter(l => l.code === "P" && l.ad === "A" && l.value !== null).reduce((s, l) => s + l.value!, 0) : 0;
  const sv = p.kind === "4" ? p.lines.filter(l => l.code === "S" && l.ad === "D" && l.value !== null).reduce((s, l) => s + l.value!, 0) : 0;
  const who = p.kind === "4" ? p.owners.map(o => o.name).join(", ") : p.items.map(itemLabel).join("; ");
  const role = p.kind === "4" ? p.owners[0]?.role ?? "" : "";
  const parts = Object.fromEntries(STAMP.formatToParts(new Date(f.acceptedAt)).map(x => [x.type, x.value]));
  const time = `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
  const date = new Date(f.acceptedAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "2-digit" });
  return (
    <>
      <span role="gridcell" className="fl-mono fl-dim" title={etStamp(f.acceptedAt)}>{mode === "co" ? date : `${parts.month}-${parts.day} ${time}`}</span>
      {mode === "tape" ? <span role="gridcell" className="fl-tk">{f.ticker ?? "—"}</span> : null}
      <span role="gridcell"><FormBadge form={f.form} /></span>
      <span role="gridcell" className={`fl-codes${mode === "tape" ? " fl-hide-sm" : ""}`}>{p.kind === "4" ? p.codes.slice(0, 4).map(c => <CodeBadge key={c} code={c} />) : p.items.slice(0, 3).map(i => <ItemBadge key={i} item={i} />)}</span>
      <span role="gridcell" title={who}>{who}</span>
      {mode === "tape" ? <span role="gridcell" className="fl-faint fl-hide-sm" title={role}>{role}</span> : null}
      <span role="gridcell" className={`fl-n${pv ? " fl-p" : sv ? " fl-s" : " fl-faint"}`}>{pv ? usd(pv) : sv ? usd(sv) : "–"}</span>
      {mode === "tape" ? <span role="gridcell" className="fl-n fl-faint fl-hide-sm" title="EDGAR acceptance to Insidir">{lag(f.detectedAt - f.acceptedAt)}</span> : null}
    </>
  );
}
