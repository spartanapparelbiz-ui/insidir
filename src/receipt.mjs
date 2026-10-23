/* The receipt: how every insider trade is drawn on the public site. A thermal-paper slip printed from one Form 4
 * line, with a rubber stamp across it: green BOUGHT (open-market purchase, code P), red SOLD (open-market sale, code S)
 * or gray PRE-SCHEDULED (a sale the filer marked as made under a Rule 10b5-1 plan). Every value is read from the
 * filing; a value the filing does not give is left off the slip, never estimated. The slip links to the filing.
 *
 * Also here, from the same rows: the ticker tape at the top of the page and the hero's live headline. */
import { esc, money, personName, companyName, kindOf } from "./site-v2.mjs";

const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const SEC = /^https:\/\/(www\.)?sec\.gov\//;

/* Which stamp: BOUGHT, SOLD or PRE-SCHEDULED. Anything else (grants, exercises, gifts) gets no stamp. */
export function stampOf(r) {
  const k = kindOf(r);
  if (k === "buy") return "bought";
  if (k === "sell") return r.rule_10b5_1 === true ? "planned" : "sold";
  return null;
}
export const STAMP_TEXT = Object.freeze({ bought: "BOUGHT", sold: "SOLD", planned: "PRE-SCHEDULED" });

/* The change in the holding this line reports, from the shares traded and the shares owned after it (both from the
 * filing). A buy into a holding of zero is a new position; a sale of everything is a full exit. null when the filing
 * gives no holding after the trade. */
export function stakeChange(r) {
  const shares = num(r.shares), after = num(r.shares_after), k = kindOf(r);
  if (shares == null || after == null || shares <= 0 || after < 0 || (k !== "buy" && k !== "sell")) return null;
  const before = k === "buy" ? after - shares : after + shares;
  if (before <= 0) return k === "buy" ? { text: "NEW POSITION", pct: null } : null;
  if (after === 0 && k === "sell") return { text: "−100% (ALL)", pct: -1 };
  const pct = (after - before) / before;
  const p = Math.abs(pct) >= 10 ? Math.round(Math.abs(pct) * 100).toLocaleString("en-US") : (Math.abs(pct) * 100).toFixed(Math.abs(pct) < 0.1 ? 1 : 0);
  return { text: (pct >= 0 ? "+" : "−") + p + "%", pct };
}

const filedAgo = (v, now) => {
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  if (!Number.isFinite(t)) return null;
  const m = Math.max(1, Math.round((now - t) / 60000));
  if (m < 60) return m + " MIN AGO";
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? " HOUR AGO" : " HOURS AGO");
  const d = Math.round(h / 24);
  return d < 14 ? d + (d === 1 ? " DAY AGO" : " DAYS AGO") : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).toUpperCase();
};
const price = v => { const n = num(v); return n == null || n <= 0 ? null : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const shares = v => { const n = num(v); return n == null || n <= 0 ? null : Math.round(n).toLocaleString("en-US"); };

/* The lines of one slip, in print order. Exported for tests. */
export function receiptLines(r, now = Date.now()) {
  const ch = stakeChange(r);
  return [
    ["INSIDER", personName(r.owner_name)],
    ["ROLE", r.role ? String(r.role).toUpperCase() : null],
    ["SHARES", shares(r.shares)],
    ["PRICE", price(r.price_per_share)],
    ["TOTAL", money(r.estimated_value)],
    ["STAKE CHANGE", ch?.text || null],
    ["FILED", r.published_at ? filedAgo(r.published_at, now) : null]
  ].filter(([, v]) => v);
}

/* One receipt. opts.print: start hidden in the printer (hero.js feeds it out); opts.tag: the element (li in lists). */
export function renderReceipt(r, { now = Date.now(), print = false, tag = "article", id = null } = {}) {
  const stamp = stampOf(r), t = String(r.ticker || "").toUpperCase();
  const co = companyName(r.issuer_name).toUpperCase() || t;
  const filing = SEC.test(String(r.source_url || "")) ? r.source_url : null;
  const rows = receiptLines(r, now).map(([k, v]) => `<div class="rc__row"><dt>${k}</dt><dd${k === "TOTAL" ? ' class="rc__total"' : ""}>${esc(v)}</dd></div>`).join("");
  const label = `${personName(r.owner_name)}${r.role ? ", " + r.role + "," : ""} ${stamp === "bought" ? "bought" : stamp ? "sold" : "reported"} ${money(r.estimated_value) || ""} of ${t}${stamp === "planned" ? " under a pre-scheduled plan" : ""}`;
  return `<${tag} class="rc${stamp ? " rc--" + stamp : ""}${print ? " rc--print" : ""}"${id ? ` data-id="${esc(id)}"` : ""} aria-label="${esc(label.replace(/\s+/g, " ").trim())}">
<div class="rc__paper"><p class="rc__head">INSIDIR · FORM 4 RECEIPT</p>
<p class="rc__co"><a href="/${esc(encodeURIComponent(t))}">${esc(co)}${co !== t ? ` (${esc(t)})` : ""}</a></p>
<dl class="rc__rows">${rows}</dl>
${filing ? `<a class="rc__link" href="${esc(filing)}" rel="nofollow noopener" target="_blank">view SEC filing →</a>` : ""}</div>
${stamp ? `<span class="rc__stamp rc__stamp--${stamp}" aria-hidden="true">${STAMP_TEXT[stamp]}</span>` : ""}
</${tag}>`;
}

/* ---------- the tape ---------- */
const ROLE_ABBR = { CEO: "CEO", CFO: "CFO", COO: "COO", president: "PRES", "general counsel": "GC", director: "DIR", "10% owner": "10% OWNER", officer: "OFFICER" };
export function tapeText(r) {
  const k = kindOf(r), who = ROLE_ABBR[r.role] || "INSIDER", amt = money(r.estimated_value);
  return `${who} ${k === "buy" ? "BOUGHT" : "SOLD"}${amt ? " " + amt : ""}${k === "sell" && r.rule_10b5_1 === true ? " · PLAN" : ""}`;
}
export function renderTape(rows) {
  const items = rows.filter(r => r.ticker && ["buy", "sell"].includes(kindOf(r))).slice(0, 24);
  if (!items.length) return "";
  const li = r => { const t = String(r.ticker).toUpperCase(), k = kindOf(r);
    return `<li><a href="/${esc(encodeURIComponent(t))}"><b>${esc(t)}</b><span class="tape__arrow tape__arrow--${k}" aria-label="${k === "buy" ? "bought" : "sold"}">${k === "buy" ? "▲" : "▼"}</span>${esc(tapeText(r))}</a></li>`; };
  const list = items.map(li).join("");
  // The second copy makes the loop seamless; screen readers and keyboards get the first only.
  return `<div class="tape" role="region" aria-label="Latest insider filings"><div class="tape__track" style="--tape-items:${items.length}"><ul>${list}</ul><ul aria-hidden="true" inert>${list}</ul></div></div>`;
}

/* ---------- the live headline ---------- */
const NAMED = new Set(["CEO", "CFO", "COO", "president", "general counsel"]);
/* One trade in one plain sentence: "A director at Pepsico just bought $1.2M of PEP." "just" only when the filing posted
 * in the last 36 hours; otherwise the trade date is given. Facts only: who (by role), what, how much, which stock. */
export function headlineOf(r, now = Date.now()) {
  const k = kindOf(r);
  if (k !== "buy" && k !== "sell") return null;
  const amt = money(r.estimated_value), t = String(r.ticker || "").toUpperCase();
  if (!amt || !t) return null;
  const co = companyName(r.issuer_name) || t;
  const own = /s$/i.test(co) ? co + "'" : co + "'s";
  const who = NAMED.has(r.role) ? `${own} ${r.role}`
    : r.role === "director" ? `A director at ${co}` : r.role === "10% owner" ? `A 10% owner of ${co}` : r.role === "officer" ? `An officer at ${co}` : `An insider at ${co}`;
  const posted = Date.parse(r.published_at);
  const recent = Number.isFinite(posted) && now - posted < 36 * 3600_000;
  const d = String(r.transaction_date instanceof Date ? r.transaction_date.toISOString() : r.transaction_date || "").slice(0, 10);
  const when = recent ? " just" : "";
  const on = !recent && /^\d{4}-\d{2}-\d{2}$/.test(d) ? " on " + new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
  const plan = k === "sell" && r.rule_10b5_1 === true ? " on a pre-set plan" : "";
  return `${who}${when} ${k === "buy" ? "bought" : "sold"} ${amt} of ${t}${on}${plan}.`;
}
/* The headlines the hero cycles through: the newest notable trades ($100K or more), at most six, distinct sentences,
 * each short enough to read at display size (MAX_HEADLINE characters). */
export const MAX_HEADLINE = 56;
export function liveHeadlines(rows, now = Date.now()) {
  const out = [];
  for (const r of rows) {
    if ((num(r.estimated_value) || 0) < 100_000) continue;
    const h = headlineOf(r, now);
    if (h && h.length > MAX_HEADLINE) continue;
    if (h && !out.includes(h)) out.push(h);
    if (out.length === 6) break;
  }
  return out;
}
