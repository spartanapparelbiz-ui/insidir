"use client";
/* The FAQ: one question open at a time, its answer opening with a smooth height (CSS grid rows). Buttons with
 * aria-expanded; every answer is in the page for search engines and screen readers. */
import { useState } from "react";

export function Faq({ items }: { items: ReadonlyArray<{ id: string; q: string; a: string }> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="b-faq">
      {items.map(f => {
        const on = open === f.id;
        return (
          <div key={f.id} className="b-faq__item" data-open={on ? "true" : "false"} data-testid="faq-item">
            <button type="button" className="b-faq__q" aria-expanded={on} aria-controls={`faq-${f.id}`} onClick={() => setOpen(on ? null : f.id)}>{f.q}</button>
            <div className="b-faq__a" id={`faq-${f.id}`} role="region"><div><p>{f.a}</p></div></div>
          </div>
        );
      })}
    </div>
  );
}
