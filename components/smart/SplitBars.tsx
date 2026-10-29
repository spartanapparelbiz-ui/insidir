/* Two numbers side by side as bars: the crowd (or all big bets) and smart money (proven traders), both on the same
 * side. Server component. */
import { pct } from "@/lib/smart/text";

export function SplitBars({ rows, side }: { rows: ReadonlyArray<{ label: string; value: number | null; note?: string; strong?: boolean }>; side: string }) {
  return (
    <dl className="sbars">
      {rows.map(r => (
        <div key={r.label} className={`sbars__row${r.strong ? " sbars__row--smart" : ""}`}>
          <dt>{r.label}{r.note ? <span>{r.note}</span> : null}</dt>
          <dd>
            {r.value === null ? <span className="sbars__na">Not enough proven traders here yet</span> : (
              <>
                <span className="sbars__track" aria-hidden="true"><span className="sbars__fill" style={{ width: `${Math.round(r.value * 100)}%` }} /></span>
                <b>{pct(r.value)}</b> <span className="sbars__side">on {side}</span>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
