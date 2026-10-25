/* Display formats. One money format ($42K), one price format (8¢), one date format (Oct 24, 2026). */

export function money(v: number): string {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}$${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}$${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}$${trim(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}
const trim = (n: number): string => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));

export function shares(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return trim(a / 1e6) + "M";
  if (a >= 1e3) return trim(a / 1e3) + "K";
  return Math.round(a).toString();
}

/** 0..1 → "8¢" ("0.4¢" under a cent, "99.9¢" near a dollar). */
export function cents(p: number): string {
  const c = p * 100;
  if (c > 0 && c < 1) return c.toFixed(1) + "¢";
  if (c > 99 && c < 100) return c.toFixed(1) + "¢";
  return Math.round(c) + "¢";
}

export const pct = (share: number): string => Math.round(share * 100) + "%";

export function day(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function ago(epochSeconds: number, now: number): string {
  const s = Math.max(0, now - epochSeconds);
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
}

export const shortAddress = (w: string): string => (w.length > 10 ? w.slice(0, 6) + "…" + w.slice(-4) : w);
