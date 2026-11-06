"use client";
/* The Cluster & Whale Stream (docs/RESEARCH-DESK.md §7): matches computed at ingestion, filtered and sorted here.
 * Sorts are the member's choice of time, dollars or ticker, never a computed score. Each card prints the lines as
 * filed with their sec.gov links. */
import { useMemo, useState } from "react";
import { day, etStamp, price, qty, usd } from "@/lib/filings/format";
import { parseInput } from "@/lib/filings/calc";
import { VELOCITY_MIN, VELOCITY_MULTIPLE, WHALE_MIN } from "@/lib/filings/rules";
import type { AnomalyKind, AnomalyRow } from "@/lib/filings/types";
import { CodeBadge } from "./Bits";

const KIND: Record<AnomalyKind, string> = { cluster: "Cluster", whale: "Whale purchase", velocity: "Filing velocity" };
type Sort = "detected" | "value" | "ticker";

export function StreamView({ rows, watched, onPin }: { rows: AnomalyRow[] | null; watched: ReadonlySet<string>; onPin: (a: AnomalyRow) => void }) {
  const [kinds, setKinds] = useState<Record<AnomalyKind, boolean>>({ cluster: true, whale: true, velocity: true });
  const [min, setMin] = useState("");
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState<Sort>("detected");
  const shown = useMemo(() => {
    const m = parseInput(min);
    const list = (rows ?? []).filter(a => kinds[a.kind] && (!mine || watched.has(a.cik)) && (m === null || (a.total ?? 0) >= m));
    return [...list].sort((a, b) => sort === "value" ? (b.total ?? -1) - (a.total ?? -1) : sort === "ticker" ? (a.ticker ?? a.company).localeCompare(b.ticker ?? b.company) : b.detectedAt - a.detectedAt);
  }, [rows, kinds, min, mine, sort, watched]);

  return (
    <section aria-labelledby="fl-stream-h" data-testid="fl-stream">
      <div className="fl-head">
        <h2 id="fl-stream-h" className="fl-h2">Cluster &amp; Whale Stream</h2>
        <p className="fl-sub">Form 4 filings that match the three rules below. A match describes what was filed; it says nothing about what the stock will do.</p>
        <details className="fl-rules">
          <summary>How matches are found</summary>
          <ul>
            <li><b>Cluster:</b> two or more separate reporting owners (owners on one filing count once) report code P open-market purchases at one company with trade dates in the same Monday-to-Sunday week. Amendments are left out.</li>
            <li><b>Whale purchase:</b> one Form 4 whose code P lines add up to {usd(WHALE_MIN)} or more, shares × price as filed.</li>
            <li><b>Filing velocity:</b> {VELOCITY_MIN} or more Form 4s accepted at one company in 7 days, and at least {VELOCITY_MULTIPLE}× its usual weekly count since Insidir began collecting (8 weeks needed). Often grants and option exercises; the codes are shown.</li>
          </ul>
        </details>
      </div>

      <div className="fl-filters" role="group" aria-label="Filter the Stream">
        {(Object.keys(KIND) as AnomalyKind[]).map(k => (
          <label key={k} className="fl-toggle"><input type="checkbox" checked={kinds[k]} onChange={e => setKinds(s => ({ ...s, [k]: e.target.checked }))} />{KIND[k]}</label>
        ))}
        <label className="fl-toggle"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} />Only my watchlists</label>
        <label className="fl-field fl-field--inline">Min total $<input className="fl-input fl-input--num" inputMode="decimal" value={min} onChange={e => setMin(e.target.value)} /></label>
        <label className="fl-field fl-field--inline">Sort
          <select className="fl-input" value={sort} onChange={e => setSort(e.target.value as Sort)}>
            <option value="detected">Newest first</option><option value="value">Largest total $</option><option value="ticker">Ticker A–Z</option>
          </select>
        </label>
      </div>

      {rows === null ? <p className="fl-small">Loading…</p> : !shown.length ? (
        <p className="fl-empty" data-testid="fl-stream-empty">{rows.length ? "No matches with these filters." : "No filings have matched the rules yet."}</p>
      ) : (
        <ul className="fl-cards">{shown.map(a => <StreamCard key={a.id} a={a} onPin={() => onPin(a)} pinned={watched.has(a.cik)} />)}</ul>
      )}
    </section>
  );
}

function StreamCard({ a, onPin, pinned }: { a: AnomalyRow; onPin: () => void; pinned: boolean }) {
  const f = a.facts;
  return (
    <li className="fl-card" data-testid="fl-stream-card" data-kind={a.kind}>
      <div className="fl-card__top">
        <span className="fl-kind">{KIND[a.kind]}</span>
        <a className="fl-link fl-card__co" href={`/filings/${encodeURIComponent(a.ticker ?? a.cik)}`}>{a.company}{a.ticker ? ` (${a.ticker})` : ""}</a>
        <span className="fl-small">Detected {etStamp(a.detectedAt)}</span>
        <button type="button" className="fl-btn fl-btn--ghost" onClick={onPin} disabled={pinned}>{pinned ? "On a watchlist" : "Pin"}</button>
      </div>
      {a.kind === "velocity" ? (
        <p className="fl-card__line">{f.count} Form 4s accepted {day(a.windowStart)} to {day(a.windowEnd)} · prior weekly mean {f.weeklyMean} over {f.baselineWeeks} weeks · codes {Object.entries(f.codes ?? {}).sort(([, x], [, y]) => y - x).map(([c, n]) => `${c} ×${n}`).join(", ")}</p>
      ) : (
        <>
          <p className="fl-card__line">{a.kind === "cluster" ? `${f.groups} owner groups · ` : ""}<CodeBadge code="P" /> trades {day(a.windowStart)}{a.windowEnd !== a.windowStart ? ` to ${day(a.windowEnd)}` : ""} · {a.total !== null ? usd(a.total) : ""} total as filed</p>
          <table className="fl-table">
            <thead><tr><th scope="col">Reporting owner</th><th scope="col">Trade date</th><th scope="col" className="fl-num">Shares</th><th scope="col" className="fl-num">Price</th><th scope="col" className="fl-num">Value</th><th scope="col"><span className="fl-sr">Filing</span></th></tr></thead>
            <tbody>
              {(f.buys ?? []).map((b, i) => (
                <tr key={`${b.accession}-${i}`}>
                  <td>{b.owners.join(" + ")}<span className="fl-small"> {b.role}</span></td>
                  <td>{day(b.date)}</td><td className="fl-num">{qty(b.shares)}</td><td className="fl-num">{price(b.price)}</td><td className="fl-num">{usd(b.value)}</td>
                  <td><a className="fl-link" href={b.url} target="_blank" rel="noopener noreferrer">Form 4 ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="fl-small">Rule v{a.ruleVersion}</p>
    </li>
  );
}
