/* Defensive readers for the venues' public JSON. Fields arrive as numbers or numeric strings ("0.4500",
 * "100.00"), arrays arrive either as arrays or as JSON-encoded strings ('["Yes","No"]'), and responses are either
 * bare arrays or wrapped ({data: [...]}, {markets: [...]}). Every reader takes `unknown` and never throws. */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: unknown };

export function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A non-empty string (numbers are stringified), else null. */
export function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** A finite number from a number or a numeric string ("0.45", "$0.45", "1,000"), else null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim().replace(/^\$/, "").replace(/,/g, "");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** true for true / "true" / 1 / "1"; everything else is false. */
export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/** true / false when the field states one, null when absent or unreadable. */
export function boolOrNull(v: unknown): boolean | null {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return null;
}

/** An array, or a JSON-encoded array string; anything else is an empty list. */
export function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export const strList = (v: unknown): string[] => list(v).map(str).filter((s): s is string => s !== null);
export const objList = (v: unknown): JsonObject[] => list(v).filter(isObject);

/** Epoch milliseconds from a number (seconds or milliseconds) or an ISO date string. */
export function epochMs(v: unknown): number | null {
  const n = num(v);
  if (n !== null) return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Rows from a response that is a bare array or wrapped under one of `keys` (default data). */
export function rows(v: unknown, keys: readonly string[] = ["data"]): JsonObject[] {
  if (Array.isArray(v)) return v.filter(isObject);
  if (isObject(v)) {
    for (const k of keys) {
      const inner = v[k];
      if (Array.isArray(inner)) return inner.filter(isObject);
    }
  }
  return [];
}

/** The first present value among `keys` of `o`. */
export function pick(o: JsonObject, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

/** Lower-case URL slug. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
