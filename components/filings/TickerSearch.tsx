"use client";
/* Ticker search: the SEC directory in memory (useTickers): exact ticker first, then prefixes, then company names.
 * ↑/↓ move, Enter picks, Esc clears and leaves the field. No request per keystroke. */
import { forwardRef, useId, useState } from "react";
import { Kbd } from "./Bits";
import { useTickers, type TickerHit } from "./hooks";

export const TickerSearch = forwardRef<HTMLInputElement, { onPick: (h: TickerHit) => void; label?: string; action?: string; hint?: string }>(
  function TickerSearch({ onPick, label = "Search a ticker or company", action = "Open", hint }, ref) {
    const [q, setQ] = useState("");
    const [active, setActive] = useState(0);
    const [touched, setTouched] = useState(false);
    const t = useTickers(touched);
    const hits = t.search(q);
    const id = useId();
    const pick = (h: TickerHit | undefined) => { if (!h) return; onPick(h); setQ(""); setActive(0); };
    return (
      <div className="fl-search" data-testid="fl-search">
        <label className="fl-sr" htmlFor={id}>{label}</label>
        <input ref={ref} id={id} className="fl-in" type="search" autoComplete="off" spellCheck={false} placeholder={label} value={q}
          role="combobox" aria-expanded={hits.length > 0} aria-controls={`${id}-list`} aria-activedescendant={hits.length ? `${id}-${active}` : undefined}
          onFocus={() => setTouched(true)}
          onChange={e => { setQ(e.target.value); setActive(0); }}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); pick(hits[active]); }
            else if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); }
          }} />
        {hint && !q ? <span className="fl-search__kbd"><Kbd k={hint} /></span> : null}
        {q && touched && !t.ready ? <ul className="fl-search__list"><li className="fl-search__hit fl-faint">Loading the SEC ticker list…</li></ul> : null}
        {q && t.ready && !hits.length ? <ul className="fl-search__list"><li className="fl-search__hit fl-faint">No SEC-registered ticker matches.</li></ul> : null}
        {hits.length ? (
          <ul id={`${id}-list`} role="listbox" className="fl-search__list">
            {hits.map((h, i) => (
              <li key={h.ticker} id={`${id}-${i}`} role="option" aria-selected={i === active} className={`fl-search__hit${i === active ? " is-active" : ""}`}
                onMouseDown={e => { e.preventDefault(); pick(h); }} onMouseEnter={() => setActive(i)}>
                <span className="fl-tk">{h.ticker}</span><span className="fl-search__name">{h.title}</span><span className="fl-label">{action}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  });
