/* Shared, deterministic helpers for Insidir Intelligence (briefing, investigations, Mirror).
 * Formatting here only re-states values read from stored SEC records; nothing is estimated. */
import { EIGHT_K_ITEMS } from "./intelligence.mjs";

export const iso = v => { if (v == null || v === "") return null; const d = v instanceof Date ? v : new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
export const day = v => iso(v)?.slice(0, 10) ?? null;
export const num = v => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/* SEC CIKs are stored both bare and 10-digit; indexed lookups need both forms. */
export function cikForms(list) {
  const out = new Set();
  for (const c of list || []) {
    const bare = String(c ?? "").trim().replace(/^0+/, "");
    if (!/^\d{1,10}$/.test(bare)) continue;
    out.add(bare); out.add(bare.padStart(10, "0"));
  }
  return [...out];
}
export const bareCik = c => String(c ?? "").replace(/^0+/, "");

/* "HUANG JEN HSUN" -> "Huang Jen Hsun". Form 4 names are filed surname first; the order is kept as filed. */
export function displayName(name) {
  const s = String(name || "").trim().replace(/\s+/g, " ");
  if (!s) return "Unnamed reporting person";
  if (/[a-z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s\-'/(.,&])([a-z])/g, (m, x, c) => x + c.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Llc|Lp|Llp|Plc|Nv|Sa|Ag|Se|Usa|Us)\b/g, w => w.toUpperCase());
}
export function companyName(name, ticker) {
  const s = String(name || "").trim().replace(/\/[A-Z]{2}\/?$/, "").trim();
  if (!s) return ticker || "Unnamed issuer";
  return /[a-z]/.test(s) ? s : displayName(s);
}

export function roleOf(o) {
  if (!o) return null;
  const parts = [];
  if (o.officer_title) parts.push(String(o.officer_title).trim().replace(/\s+/g, " ").slice(0, 60));
  else if (o.is_officer) parts.push("Officer");
  if (o.is_director) parts.push("Director");
  if (o.is_ten_percent_owner) parts.push("10% owner");
  return parts.join(" · ") || null;
}

export const money = n => n == null ? null : "$" + Math.round(Number(n)).toLocaleString("en-US");
export const count = (n, one, many = one + "s") => n + " " + (n === 1 ? one : many);

/* Transaction code meanings (SEC Form 4 General Instructions, Item 8). */
export const CODE_LABELS = Object.freeze({
  P: "open-market or private purchase", S: "open-market or private sale", A: "grant or award", D: "disposition to the issuer",
  F: "shares withheld for tax or exercise price", M: "option or derivative exercise", C: "derivative conversion", G: "gift",
  X: "exercise of in-the-money derivative", J: "other acquisition or disposition", W: "acquisition or disposition by will",
  I: "discretionary transaction", V: "voluntarily reported transaction", E: "expiration of short derivative", H: "expiration of long derivative",
  O: "exercise of out-of-the-money derivative", K: "equity swap", L: "small acquisition", U: "tender of shares", Z: "voting trust deposit or withdrawal"
});
export const codeLabel = c => CODE_LABELS[String(c || "").toUpperCase()] || "other reported change";

export function eightKLabel(codes) {
  const labels = (codes || []).filter(c => EIGHT_K_ITEMS[c] && c !== "9.01").map(c => EIGHT_K_ITEMS[c] + " (Item " + c + ")");
  return labels.join("; ");
}

/* Only https links on SEC hosts are shown as primary sources. */
export function secSource(url) {
  try { const u = new URL(url); return u.protocol === "https:" && (u.hostname === "www.sec.gov" || u.hostname === "data.sec.gov") ? u.href : null; } catch { return null; }
}

/* Aggregate Form 4 lines deterministically. Lines superseded by a later amendment in the same set are
 * not double counted: an amendment's line with the same owner, date, code and shares replaces the original. */
export function summarizeLines(lines) {
  const key = l => [bareCik(l.owner_cik) || l.owner_name, day(l.transaction_date), l.transaction_code, l.shares, l.derivative].join("|");
  const latest = new Map();
  for (const l of lines) {
    const k = key(l), prev = latest.get(k);
    if (!prev || (l.is_amendment && !prev.is_amendment) || (iso(l.published_at) || "") > (iso(prev.published_at) || "")) latest.set(k, l);
  }
  const used = [...latest.values()];
  const s = { lines: used.length, duplicatesCollapsed: lines.length - used.length, purchases: 0, sales: 0, other: 0,
    purchaseValue: 0, saleValue: 0, purchaseShares: 0, saleShares: 0, valuesMissing: 0, derivative: 0 };
  for (const l of used) {
    const v = num(l.estimated_value), sh = num(l.shares);
    if (l.derivative) s.derivative++;
    if (l.category === "reported_purchase") { s.purchases++; if (v != null) s.purchaseValue += v; else s.valuesMissing++; if (sh != null) s.purchaseShares += sh; }
    else if (l.category === "reported_sale") { s.sales++; if (v != null) s.saleValue += v; else s.valuesMissing++; if (sh != null) s.saleShares += sh; }
    else s.other++;
  }
  s.purchaseValue = Math.round(s.purchaseValue * 100) / 100; s.saleValue = Math.round(s.saleValue * 100) / 100;
  return s;
}
