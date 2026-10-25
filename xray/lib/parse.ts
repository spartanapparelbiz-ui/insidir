/* Defensive readers for Polymarket's public JSON. Fields arrive as numbers or numeric strings, and Gamma's
 * outcomes / outcomePrices / clobTokenIds arrive either as arrays or as JSON-encoded strings ('["Yes","No"]').
 * Every reader takes `unknown` and never throws. */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
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
export const numList = (v: unknown): number[] => list(v).map(x => num(x) ?? 0);

/** Epoch seconds from a number (seconds or milliseconds) or an ISO date string. */
export function epochSeconds(v: unknown): number | null {
  const n = num(v);
  if (n !== null) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? Math.floor(t / 1000) : null;
  }
  return null;
}

/** Rows from a response that is either a bare array or wrapped as {data: [...]}. */
export function rows(v: unknown): JsonObject[] {
  const arr = Array.isArray(v) ? v : isObject(v) && Array.isArray(v.data) ? v.data : [];
  return arr.filter(isObject);
}
