/* The pieces every data page uses: stat tiles (a big number, a small grey label under it, nothing else), breakdown
 * tables (no vertical lines, 56px rows, numbers right), a leaderboard and the day × hour heatmap. Anything built on
 * fewer than 20 settled moves says "Not enough data yet" (lib/stats.ts). Server components. */

/* ---------- formatting ---------- */

export const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${(v * 100).toFixed(digits)}%`);
export const pts = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} pts`);

/* ---------- tiles ---------- */

/* ---------- tables ---------- */

