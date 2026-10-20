/* Insidir Evidence: one shape for every source behind a figure, a connection or a change.
 *
 *   { source, title, entity: {name, cik}, filedOn, period: {start, end, type}, field, value, units, methodology, url }
 *
 * source       the record type as the SEC names it ("SEC Form 4", "SEC Form 13F-HR", "SEC XBRL company facts")
 * title        what the record is, in words
 * entity       who filed it or whom it is about, with the SEC CIK
 * filedOn      the date the SEC received it (YYYY-MM-DD)
 * period       the period the value covers, when it has one (a transaction date is a one-day period)
 * field        the field or passage the value was read from ("transactionShares", "us-gaap:Revenues")
 * value/units  the value exactly as stored, and its units ("shares", "USD", "USD per share")
 * methodology  how Insidir derived anything that is not copied verbatim (null when the value is copied)
 * url          the SEC document (always https://www.sec.gov/ or https://data.sec.gov/)
 *
 * evidence() refuses to build an item without an SEC link, so nothing reaches the page without its source. */
const SEC_URL = /^https:\/\/(www|data)\.sec\.gov\//;
const day = v => v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null;
const cik10 = v => v == null || !/^\d{1,10}$/.test(String(v).trim()) ? null : String(Number(v)).padStart(10, "0");
const numeric = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

export function evidence({ source, title, entity = null, filedOn = null, period = null, field = null, value = null, units = null, methodology = null, url }) {
  if (!SEC_URL.test(String(url || ""))) return null;
  const p = period && (period.start || period.end) ? { start: day(period.start), end: day(period.end), type: period.type || null } : null;
  return {
    source: String(source || "SEC filing"), title: String(title || source || "SEC filing").slice(0, 200),
    entity: entity ? { name: entity.name ? String(entity.name).slice(0, 150) : null, cik: cik10(entity.cik) } : null,
    filedOn: day(filedOn), period: p, field: field ? String(field).slice(0, 120) : null,
    value: typeof value === "string" && numeric(value) == null ? value.slice(0, 200) : numeric(value), units: units ? String(units).slice(0, 40) : null,
    methodology: methodology ? String(methodology).slice(0, 400) : null, url: String(url)
  };
}
export const evidenceList = items => items.filter(Boolean);

/* A Form 4 line as evidence: the shares (or the derivative count) and the date, copied as filed. */
export function form4LineEvidence(line, filing) {
  return evidence({ source: "SEC Form " + (filing.form_type || "4"), title: (filing.issuer_name || "Issuer") + ": " + (line.security_title || "security") + ", code " + (line.transaction_code || "?"),
    entity: { name: line.owner_name || filing.owner_name || null, cik: line.owner_cik || null }, filedOn: filing.published_at,
    period: line.transaction_date ? { start: line.transaction_date, end: line.transaction_date, type: "transaction date" } : null,
    field: line.derivative ? "derivativeTransaction/transactionShares" : "nonDerivativeTransaction/transactionShares", value: line.shares,
    units: line.derivative ? "derivative securities" : "shares", url: line.source_url || filing.source_url });
}
