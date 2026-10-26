/* The $1 bar: the whole idea in one picture. One bar is $1.00, the payout of one set. The purchases fill it from the
 * left ("YES on Kalshi 55¢", "NO on Polymarket US 40¢"); what's left is the gap, bright Paper, labelled "You keep".
 * A thin marker inside the gap splits off the fees, so what you keep is the part after fees. Prices that add to $1
 * or more leave no gap: the bar says so ("Over $1 by 1¢. Not a deal.").
 *
 * Sizes: "lg" (the hero: labels under each segment; animates once on load when `animate`: the purchases slide in from
 * opposite sides, then the gap appears; a slow shimmer on the gap), "sm" (rows and cards: a thin static bar).
 * Server-safe (no hooks). Reduced motion: the final state, still. Screen readers get one sentence. */
export interface DollarLeg { label: string; cents: number }

const c1 = (c: number) => (Math.round(c * 10) / 10).toFixed(Number.isInteger(Math.round(c * 10) / 10) ? 0 : 1) + "¢";

export function DollarBar({ legs, feesCents = 0, size = "sm", animate = false, keepLabel }: {
  legs: readonly DollarLeg[];
  /** Fees per $1 payout, in cents (inside the gap). */
  feesCents?: number;
  size?: "sm" | "lg";
  animate?: boolean;
  /** Overrides the "You keep" text in the large bar (e.g. "You keep $4.60"). */
  keepLabel?: string;
}) {
  const spent = legs.reduce((s, l) => s + l.cents, 0);
  const gap = Math.max(0, 100 - spent);
  const fees = Math.min(gap, Math.max(0, feesCents));
  const keep = Math.max(0, gap - fees);
  const scale = Math.max(100, spent);
  const w = (c: number) => `${(100 * c) / scale}%`;
  const said = gap > 0
    ? `Out of $1: ${legs.map(l => `${l.label} ${c1(l.cents)}`).join(", ")}. ${fees ? `Fees ${c1(fees)}. ` : ""}You keep ${c1(keep)}.`
    : `${legs.map(l => `${l.label} ${c1(l.cents)}`).join(" plus ")} is ${c1(spent)}: over $1, so there's nothing to keep.`;
  return (
    <figure className={`dbar dbar--${size}${animate ? " dbar--animate" : ""}${gap > 0 ? "" : " dbar--over"}`} role="img" aria-label={said}>
      <div className="dbar__track" aria-hidden="true">
        {legs.map((l, i) => (
          <span key={i} className={`dbar__seg dbar__seg--${i % 2 ? "b" : "a"}`} style={{ width: w(l.cents) }}>
            {size === "lg" ? <span className="dbar__in mono">{c1(l.cents)}</span> : null}
          </span>
        ))}
        {gap > 0 ? (
          <span className="dbar__gap" style={{ width: w(gap) }}>
            {fees > 0 ? <span className="dbar__fees" style={{ width: `${(100 * fees) / gap}%` }} /> : null}
          </span>
        ) : null}
      </div>
      {size === "lg" ? (
        <figcaption className="dbar__legend" aria-hidden="true">
          {legs.map((l, i) => <span key={i} className="dbar__key" style={{ width: w(l.cents) }}>{l.label}</span>)}
          {gap > 0 ? <span className="dbar__key dbar__key--keep" style={{ width: w(gap) }}>{keepLabel ?? `You keep ${c1(keep)}`}{fees > 0 ? <span className="dbar__feenote"> after {c1(fees)} fees</span> : null}</span>
            : <span className="dbar__key dbar__key--over">Over $1 by {c1(spent - 100)}. Not a deal.</span>}
        </figcaption>
      ) : null}
    </figure>
  );
}
