/* The one panel (a clean card): its title in sentence case (`n` is kept for callers, not shown), a right-aligned meta line (counts, "FETCHED 10:31 PM ET"), the body, and a one-line source footer
 * ("SOURCE: POLYMARKET PUBLIC DATA · FETCHED …"). Panels tile in a <PanelGrid> separated by 1px lines. When there's
 * nothing real to show, pass `empty` and the panel says so. Server-safe. */
import type { ReactNode } from "react";

const FETCHED = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
/** "updated 10:31 PM ET". Pure. */
export const fetchedText = (ms: number): string => `updated ${FETCHED.format(new Date(ms))} ET`;

export function Panel({ n, title, meta, source, fetchedAt, empty, children, span = 1, id, testid, compact = false }: {
  n?: number; title: string; meta?: ReactNode; source?: string; fetchedAt?: number | null; empty?: string | null; children?: ReactNode;
  /** Columns it takes in the grid (1–3); full width on phones. */ span?: 1 | 2 | 3; id?: string; testid?: string; compact?: boolean;
}) {
  void n;
  const foot = source ? `Source: ${source}${fetchedAt ? ` · ${fetchedText(fetchedAt)}` : ""}` : fetchedAt ? fetchedText(fetchedAt) : null;
  return (
    <section className={`t-panel t-span-${span}${compact ? " t-panel--compact" : ""}`} id={id} data-testid={testid} aria-label={title}>
      <header className="t-panel__head">
        <h2 className="t-panel__title">{title}</h2>
        {meta ? <div className="t-panel__meta">{meta}</div> : null}
      </header>
      <div className="t-panel__body">{empty ? <p className="t-empty" data-testid="t-empty">{empty}</p> : children}</div>
      {foot ? <footer className="t-panel__src">{foot}</footer> : null}
    </section>
  );
}

export function PanelGrid({ children, testid }: { children: ReactNode; testid?: string }) {
  return <div className="t-grid" data-testid={testid}>{children}</div>;
}
