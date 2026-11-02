/* Number formats for the new design system, shared by server pieces and the ticking client numbers
 * (components/nx/Tick.tsx). Pure. */
export type TickFormat = "usd" | "usdExact" | "cents" | "pct" | "int";
export function fmt(v: number, f: TickFormat): string {
  if (f === "cents") return `${Math.round(v * 100)}¢`;
  if (f === "pct") return `${Math.round(v * 100)}%`;
  if (f === "int") return Math.round(v).toLocaleString("en-US");
  if (f === "usdExact") return `$${Math.round(v).toLocaleString("en-US")}`;
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `${s}$${Math.round(a)}`;
}

