/* Display formats. */
export const pct = (v: number, digits = 1): string => (v * 100).toFixed(digits) + "%";
export function usd(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 10_000) return `${s}$${(a / 1e3).toFixed(1)}K`;
  if (a >= 100) return `${s}$${Math.round(a).toLocaleString("en-US")}`;
  return `${s}$${a.toFixed(2)}`;
}
export const centsText = (c: number): string => (Number.isInteger(c) ? c : c.toFixed(1)) + "¢";
export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
}
export function days(d: number): string {
  if (d < 1) return Math.max(1, Math.round(d * 24)) + "h";
  return Math.round(d) + "d";
}

/** "3m 41s", "1h 12m", "45s": an elapsed span, exact to the second under an hour. */
export function span(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  return `${h}h ${Math.floor((s % 3600) / 60)}m`;
}

/** "just now" under 10 seconds, else ago(). */
export const agoOrNow = (ms: number, now: number): string => (now - ms < 10_000 ? "now" : ago(ms, now));

const CLOCK = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
/** "3:42 PM" in the viewer's own time zone (render on the client). */
export const clockText = (ms: number): string => CLOCK.format(new Date(ms));

/* Column formats for tables: fixed decimals so a column lines up ("3.40%", "$7.52", "$1,242.00"). */
/** A percentage to exactly 2 decimals: "3.40%". */
export const pct2 = (v: number): string => (v * 100).toFixed(2) + "%";
/** Dollars to exactly 2 decimals with thousands separators: "$1,242.00", "−$3.10". */
export const money2 = (v: number): string =>
  `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A price in cents to exactly 1 decimal: "55.0¢". */
export const cents1 = (c: number): string => c.toFixed(1) + "¢";
/** "3m 12s", always minutes and seconds under an hour ("0m 45s"), so a column of timers keeps its width. */
export function clock2(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
