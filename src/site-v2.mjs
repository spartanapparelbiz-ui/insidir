/* Shared server-rendered helpers for the public pages (the landing page, /<TICKER>): one date format ("Oct 16, 2026"),
 * one money format ("$1.2M"), plain-English trade sentences, buy and sell kinds. The page chrome is in src/site-ui.mjs.
 * Every trade carries its SEC filing link. */
import { roleWord } from "./track-record.mjs";

export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

export function money(v) {
  const n = num(v);
  if (n == null) return null;
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return s + "$" + Math.round(a / 1e3) + "K";
  return s + "$" + Math.round(a).toLocaleString("en-US");
}
export const price = v => { const n = num(v); return n == null ? null : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const iso = v => v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null;
export function day(v) {
  const d = iso(v);
  return d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}
export function ago(v, now = Date.now()) {
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  if (!Number.isFinite(t)) return null;
  const m = Math.max(1, Math.round((now - t) / 60000));
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.round(h / 24);
  return d < 8 ? d + (d === 1 ? " day ago" : " days ago") : day(v);
}
export const pct = r => r == null ? null : (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r * 100).toFixed(1) + "%";

// "HUANG JEN HSUN" → "Jen Hsun Huang"; already mixed-case names are kept.
export function personName(raw) {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "An insider";
  if (s !== s.toUpperCase()) return s;
  const parts = s.toLowerCase().split(" ").map(w => w.replace(/(^|[-'])([a-z])/g, (_, a, b) => a + b.toUpperCase())).map(w => /^[A-Z]$/.test(w) ? w + "." : w);
  // Form 4 names are filed surname first: move it to the end when there are two or more words.
  return parts.length > 1 && !/,/.test(s) ? [...parts.slice(1), parts[0]].join(" ") : parts.join(" ");
}
export function companyName(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const t = s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : s;
  return t.replace(/\b(Inc|Corp|Corporation|Co|Ltd|Plc|Llc|Lp|Holdings|Group|N\.?V|S\.?A)\.?$/i, "").replace(/[,\s]+$/, "").replace(/\bIi\b/, "II") || t;
}
export const role = owner => roleWord(owner) || null;

export const kindOf = r => String(r.transaction_code || "").toUpperCase() === "P" ? "buy" : String(r.transaction_code || "").toUpperCase() === "S" ? "sell" : "other";

/* One trade in plain English: "Robert Pohlad, a director, bought $23.7M of PepsiCo stock on Oct 14, 2026." */
export function sentence(r, { company = true } = {}) {
  const who = personName(r.owner_name), what = kindOf(r), roleW = r.role || null;
  const value = money(r.estimated_value), sh = num(r.shares);
  const amount = value ? value + " of " : sh ? Math.round(sh).toLocaleString("en-US") + " shares of " : "shares of ";
  const co = company ? (r.ticker ? String(r.ticker).toUpperCase() : companyName(r.issuer_name) || "the company's") + " stock" : "the stock";
  const verb = what === "buy" ? "bought" : what === "sell" ? "sold" : "reported";
  const plan = what === "sell" && r.rule_10b5_1 === true ? ", under a plan set up in advance" : "";
  const when = day(r.transaction_date);
  const article = roleW ? (/^(CEO|CFO|COO|president|general counsel)$/.test(roleW) ? "the " : "a ") : "";
  return `${who}${roleW ? ", " + article + roleW + "," : ""} ${verb} ${amount}${co}${when ? " on " + when : ""}${plan}.`;
}


/* Lines with the reporting owner's role, as filed (sec_filing_owners). */
export const LINE_SQL = `SELECT t.id,t.accession,t.issuer_cik,t.ticker,t.owner_cik,t.owner_name,t.transaction_date,t.transaction_code,t.category,t.derivative,
    t.shares,t.shares_after,t.price_per_share,t.estimated_value,t.source_url,f.issuer_name,f.published_at,f.rule_10b5_1,f.is_amendment,
    o.is_director,o.is_officer,o.officer_title,o.is_ten_percent_owner
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  LEFT JOIN sec_filing_owners o ON o.accession=t.accession AND t.owner_cik IS NOT NULL AND LTRIM(o.owner_cik,'0')=LTRIM(t.owner_cik,'0')`;
export const withRole = rows => rows.map(r => ({ ...r, role: role(r) }));

/* ---------- page chrome (the head, nav and footer are in src/site-ui.mjs) ---------- */
export const scripts = () => `<script src="/assets/js/ds.js?v=2" defer></script>
<script src="/assets/js/site-v2.js?v=1" defer></script>
<script src="/assets/js/funnel.js" defer></script>
<script src="/assets/js/posthog.js?v=1" defer></script>`;

