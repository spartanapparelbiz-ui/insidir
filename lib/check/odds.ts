/* The chance a bet slip's price stands for, pure. Every way books print a price:
 *   American   +150 → 40%   −200 → 66.7%
 *   decimal    2.50 → 40%
 *   fractional 3/2 → 40%
 *   cents      45¢ / 45c / $0.45 (Kalshi, Polymarket, Robinhood) → 45%
 *   percent    45% → 45%
 * Null when the text isn't a price. */
export function chanceFrom(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const t = odds.trim().replace(/\s+/g, "").replace(/[−–]/g, "-");
  let m = /^([+-])(\d{3,5})$/.exec(t);
  if (m) {
    const n = Number(m[2]);
    return m[1] === "+" ? 100 / (n + 100) : n / (n + 100);
  }
  m = /^(\d+(?:\.\d+)?)%$/.exec(t);
  if (m) { const p = Number(m[1]) / 100; return p > 0 && p < 1 ? p : null; }
  m = /^(\d{1,2}(?:\.\d+)?)(?:¢|c|cents?)$/i.exec(t);
  if (m) { const p = Number(m[1]) / 100; return p > 0 && p < 1 ? p : null; }
  m = /^\$0?\.(\d{1,3})$/.exec(t);
  if (m) { const p = Number(`0.${m[1]}`); return p > 0 && p < 1 ? p : null; }
  m = /^(\d+)\/(\d+)$/.exec(t);
  if (m && Number(m[2]) > 0) return Number(m[2]) / (Number(m[1]) + Number(m[2]));
  m = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (m) {
    const d = Number(m[1]);
    if (d > 1 && d < 1000) return 1 / d;
  }
  return null;
}

/** "45%" */
export const asChance = (p: number | null): string | null => (p === null ? null : `${Math.round(p * 1000) / 10}%`.replace(".0%", "%"));
