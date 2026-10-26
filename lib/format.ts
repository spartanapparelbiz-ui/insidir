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
export const agoOrNow = (ms: number, now: number): string => (now - ms < 10_000 ? "just now" : ago(ms, now));

const CLOCK = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
/** "3:42 PM" in the viewer's own time zone (render on the client). */
export const clockText = (ms: number): string => CLOCK.format(new Date(ms));
