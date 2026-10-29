"use client";
/* Top performers' window tabs (1W 1M 3M 6M 1Y): every list is rendered on the server; this only shows one. */
import { useState, type ReactNode } from "react";

export function PeriodTabs({ tabs, initial }: { tabs: Array<{ key: string; label: string; body: ReactNode }>; initial: string }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="ptabs">
      <div className="seg seg--sm" role="tablist" aria-label="Time window">
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" id={`pt-${t.key}`} aria-controls={`pp-${t.key}`} aria-selected={on === t.key} aria-pressed={on === t.key}
            className="seg__btn" onClick={() => setOn(t.key)}>{t.label}</button>
        ))}
      </div>
      {tabs.map(t => <div key={t.key} id={`pp-${t.key}`} role="tabpanel" aria-labelledby={`pt-${t.key}`} hidden={on !== t.key}>{t.body}</div>)}
    </div>
  );
}
