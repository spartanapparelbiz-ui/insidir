/* The $1 bar (docs/BRIEF.md §4.1): the whole idea in one picture. One bar is $1.00, the payout of one set. The two
 * purchases fill it from the ends ("YES on Kalshi 48¢", "NO on Polymarket US 46¢"); what's left is the gap, Violet,
 * labelled "You keep". A thin hatched slice inside the gap is the fees, so what you keep is the part after fees.
 * Prices that add to $1 or more leave no gap, and the bar says so ("Over $1 by 1¢. Not a deal.").
 *
 * Sizes: "hero" (full width, labels under each segment; with `animate`, the 900ms hero sequence: the purchases fill
 * from both ends, then the gap appears, then the label lands), "card" (compact, static, labels under), "inline" (a
 * thin bar for table rows). "lg" and "sm" are the old names for hero and card. Square ends (radius 0).
 * Server-safe (no hooks). Reduced motion: the final state. Screen readers get one sentence:
 * "Spend 95 cents, get 1 dollar back, keep 4.6 cents after fees." */
export interface DollarLeg { label: string; cents: number }
export type DollarBarSize = "hero" | "card" | "inline" | "lg" | "sm";

const r1 = (c: number) => Math.round(c * 10) / 10;
const c1 = (c: number) => { const v = r1(c); return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + "¢"; };
const spoken = (c: number) => { const v = r1(c); return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)} ${v === 1 ? "cent" : "cents"}`; };

/** The bar's sentence for screen readers. */
export function dollarBarLabel(legs: readonly DollarLeg[], feesCents = 0): string {
  const spent = legs.reduce((s, l) => s + l.cents, 0);
  const gap = Math.max(0, 100 - spent);
  const keep = Math.max(0, gap - Math.min(gap, Math.max(0, feesCents)));
  if (gap <= 0) return `Spend ${spoken(spent)} to get 1 dollar back: over 1 dollar, so there's nothing to keep.`;
  return `Spend ${spoken(spent)}, get 1 dollar back, keep ${spoken(keep)} after fees.`;
}

export function DollarBar({ legs, feesCents = 0, size = "card", animate = false, keepLabel }: {
  legs: readonly DollarLeg[];
  /** Fees per $1 payout, in cents (inside the gap). */
  feesCents?: number;
  size?: DollarBarSize;
  animate?: boolean;
  /** Overrides the "You keep" text (e.g. "You keep $4.60 at $100"). */
  keepLabel?: string;
}) {
  const s = size === "lg" ? "hero" : size === "sm" ? "card" : size;
  const spent = legs.reduce((a, l) => a + l.cents, 0);
  const gap = Math.max(0, 100 - spent);
  const fees = Math.min(gap, Math.max(0, feesCents));
  const keep = Math.max(0, gap - fees);
  const scale = Math.max(100, spent);
  const w = (c: number) => `${(100 * c) / scale}%`;
  const labels = s !== "inline";
  return (
    <figure className={`dbar dbar--${s}${animate && s === "hero" ? " dbar--animate" : ""}${gap > 0 ? "" : " dbar--over"}`} role="img" aria-label={dollarBarLabel(legs, feesCents)}>
      <div className="dbar__track" data-draw="bars" aria-hidden="true">
        {legs.map((l, i) => (
          <span key={i} className={`dbar__seg dbar__seg--${i % 2 ? "b" : "a"}`} style={{ width: w(l.cents) }}>
            {s === "hero" ? <span className="dbar__in mono">{c1(l.cents)}</span> : null}
          </span>
        ))}
        {gap > 0 ? (
          <span className="dbar__gap" style={{ width: w(gap) }}>
            {fees > 0 ? <span className="dbar__fees" style={{ width: `${(100 * fees) / gap}%` }} /> : null}
          </span>
        ) : null}
      </div>
      {labels ? (
        <figcaption className="dbar__legend" aria-hidden="true">
          {legs.map((l, i) => <span key={i} className="dbar__key" style={{ width: w(l.cents) }}>{l.label}{s === "card" ? <span className="mono"> {c1(l.cents)}</span> : null}</span>)}
          {gap > 0 ? <span className="dbar__key dbar__key--keep" style={{ width: w(gap) }}>{keepLabel ?? `You keep ${c1(keep)}`}{fees > 0 ? <span className="dbar__feenote mono"> after {c1(fees)} fees</span> : null}</span>
            : <span className="dbar__key dbar__key--over">Over $1 by {c1(spent - 100)}. Not a deal.</span>}
        </figcaption>
      ) : null}
    </figure>
  );
}
