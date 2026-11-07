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
interface DollarLeg { label: string; cents: number }

const r1 = (c: number) => Math.round(c * 10) / 10;
const spoken = (c: number) => { const v = r1(c); return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)} ${v === 1 ? "cent" : "cents"}`; };

/** The bar's sentence for screen readers. */
export function dollarBarLabel(legs: readonly DollarLeg[], feesCents = 0): string {
  const spent = legs.reduce((s, l) => s + l.cents, 0);
  const gap = Math.max(0, 100 - spent);
  const keep = Math.max(0, gap - Math.min(gap, Math.max(0, feesCents)));
  if (gap <= 0) return `Spend ${spoken(spent)} to get 1 dollar back: over 1 dollar, so there's nothing to keep.`;
  return `Spend ${spoken(spent)}, get 1 dollar back, keep ${spoken(keep)} after fees.`;
}

