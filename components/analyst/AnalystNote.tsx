/* An analyst note (lib/analyst): labelled "Analyst note", at most 3 sentences, written from the position's facts only,
 * with a Sources toggle that lists every fact it could use and where each comes from. `open` shows the sources
 * expanded (the home page's example). Works without JavaScript (<details>). */
import type { Fact } from "@/lib/analyst/types";
import { clockET } from "@/lib/moves/copy";

export function AnalystNote({ text, facts, at, open = false, className = "" }: { text: string; facts: Fact[]; at: number; open?: boolean; className?: string }) {
  return (
    <div className={`anote ${className}`.trim()} data-testid="analyst-note">
      <p className="anote__label">Analyst note</p>
      <p className="anote__text">{text}</p>
      <details className="anote__src" open={open || undefined}>
        <summary>Sources</summary>
        <dl className="anote__facts">
          {facts.map(f => (
            <div key={f.key} className="anote__fact">
              <dt>{f.label}</dt>
              <dd>{f.text}{f.source ? <> · <a href={f.source.href} {...(/^https?:/.test(f.source.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{f.source.label}</a></> : null}</dd>
            </div>
          ))}
        </dl>
        <p className="anote__fine">Facts as of <time dateTime={new Date(at).toISOString()}>{clockET(at)}</time>, computed from Insidir&apos;s data. The note may use only these. It describes data; it isn&apos;t advice. <a href="/methodology#analyst-notes">How notes are written</a></p>
      </details>
    </div>
  );
}
