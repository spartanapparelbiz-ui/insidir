/* Small Filings pieces: raw code and item badges with the SEC's own labels, one filing row, the freshness pill and the
 * research disclaimer. Server-safe (no hooks). */
import type { ReactNode } from "react";
import { CALC_LINE, RESEARCH_DISCLAIMER } from "@/lib/copy";
import { codeLabel, itemLabel } from "@/lib/filings/codes";
import { etStamp, filingDetail, filingTitle } from "@/lib/filings/format";
import type { FilingRow } from "@/lib/filings/types";

/** A Form 4 transaction code: the letter, the SEC's description on hover. Code P wears the emerald accent. */
export function CodeBadge({ code }: { code: string }) {
  return <abbr className={`fl-code${code === "P" ? " fl-code--p" : ""}`} title={`Code ${code}: ${codeLabel(code)}`} data-testid="fl-code">{code}</abbr>;
}

/** An 8-K item number with its official title on hover. */
export function ItemBadge({ item }: { item: string }) {
  return <abbr className="fl-code" title={`Item ${item}: ${itemLabel(item)}`}>{item}</abbr>;
}

/** One filing, as filed: form and codes or items, who and what, both clocks, the sec.gov link. */
export function FilingItem({ f, unread, action, held }: { f: FilingRow; unread?: boolean; action?: ReactNode; held?: boolean }) {
  const p = f.payload;
  return (
    <li className={`fl-row${unread ? " fl-row--unread" : ""}`} data-testid="fl-filing">
      <div className="fl-row__main">
        <p className="fl-row__title">
          <a className="fl-link" href={`/filings/${encodeURIComponent(f.ticker ?? f.cik)}`}>{filingTitle(f, { codes: false })}</a>
          {p.kind === "4" ? p.codes.map(c => <CodeBadge key={c} code={c} />) : p.items.map(i => <ItemBadge key={i} item={i} />)}
          {held ? <span className="fl-chip">You log a position</span> : null}
        </p>
        <p className="fl-row__sub">{filingDetail(f)}</p>
        <p className="fl-row__meta">Accepted by EDGAR {etStamp(f.acceptedAt)} · in Insidir {etStamp(f.detectedAt)}</p>
      </div>
      <div className="fl-row__side">
        <a className="fl-btn fl-btn--ghost" href={f.url} target="_blank" rel="noopener noreferrer">sec.gov ↗</a>
        {action}
      </div>
    </li>
  );
}

/** EDGAR freshness: live, stale (no successful poll for 5 minutes) or paused (the poll is failing). */
export function Freshness({ lastOk, failing, now }: { lastOk: number | null; failing: boolean; now: number }) {
  const stale = lastOk !== null && now - lastOk > 5 * 60_000;
  const label = failing ? "Feed not reachable, retrying" : stale ? "Feed stale, retrying" : lastOk ? "Live · updates every 15 s" : "Connecting";
  return <span className={`fl-pill${failing || stale ? " fl-pill--warn" : ""}`} role="status" data-testid="fl-freshness">{label}</span>;
}

/** The research disclaimer: under every Filings view (docs/RESEARCH-DESK.md §2.3). */
export function ResearchFoot() {
  return <p className="fl-foot" data-testid="fl-disclaimer">{RESEARCH_DISCLAIMER}</p>;
}

/** Under every calculator: whose numbers these are. */
export function CalcLine() {
  return <p className="fl-small" data-testid="fl-calc-line">{CALC_LINE}</p>;
}
