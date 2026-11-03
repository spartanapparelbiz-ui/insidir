"use client";
/* Glass FAQ rows: one open at a time, plus turning to minus, the answer opening with a smooth height. */
import { useState, type CSSProperties } from "react";

export function Faq({ items }: { items: ReadonlyArray<{ id: string; q: string; a: string }> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="b-faq">
      {items.map((f, i) => {
        const on = open === f.id;
        return (
          <div key={f.id} className="b-faq__item b-glass" data-open={on ? "true" : "false"} data-testid="faq-item" data-m="settle" style={{ "--d": `${0.5 + i * 0.06}s` } as CSSProperties}>
            <button type="button" className="b-faq__q" aria-expanded={on} aria-controls={`faq-${f.id}`} onClick={() => setOpen(on ? null : f.id)}>{f.q}<span className="b-faq__pm" aria-hidden="true" /></button>
            <div className="b-faq__a" id={`faq-${f.id}`} role="region"><div><p>{f.a}</p></div></div>
          </div>
        );
      })}
    </div>
  );
}
