"use client";
/* Category or window tabs over panels the server already rendered: the tabs only show and hide them (no refetch).
 * Keyboard: arrow keys move between tabs (WAI-ARIA tabs pattern). */
import { useId, useRef, useState, type ReactNode } from "react";

export function Tabs({ labels, children, testid, label }: { labels: readonly string[]; children: ReactNode[]; testid?: string; label: string }) {
  const [on, setOn] = useState(0);
  const id = useId(), refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (i: number) => { const n = (i + labels.length) % labels.length; setOn(n); refs.current[n]?.focus(); };
  return (
    <div data-testid={testid}>
      <div className="nx-tabs" role="tablist" aria-label={label}>
        {labels.map((l, i) => (
          <button key={l} ref={el => { refs.current[i] = el; }} type="button" role="tab" id={`${id}-t${i}`} aria-controls={`${id}-p${i}`} aria-selected={on === i}
            tabIndex={on === i ? 0 : -1} className="nx-tab" onClick={() => setOn(i)}
            onKeyDown={e => { if (e.key === "ArrowRight") move(i + 1); else if (e.key === "ArrowLeft") move(i - 1); }}>{l}</button>
        ))}
      </div>
      {children.map((c, i) => (
        <div key={i} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} className="nx-tabpanel" hidden={on !== i}>{c}</div>
      ))}
    </div>
  );
}
