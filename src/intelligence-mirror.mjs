/* Intelligence Mirror: explore a manager's publicly disclosed 13F holdings and model an illustrative,
 * research-only allocation of a hypothetical budget in proportion to the reported values.
 *
 * It is a calculation on a quarterly disclosure, not a recommendation and not a trade: there is no
 * brokerage connection, no order and no "copy" action anywhere in this module, and the result says so.
 * All arithmetic is done here, in code; nothing is estimated by a model. */
import { query as queryDb } from "./db.mjs";
import { cik10 } from "./form13f.mjs";
import { iso, day, companyName } from "./intelligence-common.mjs";

const fail = (status, message) => Object.assign(new Error(message), { status });
export const MIN_BUDGET = 1, MAX_BUDGET = 10_000_000;

export function parseBudget(raw) {
  const s = String(raw ?? "").trim().replace(/[$,\s]/g, "");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) throw fail(400, "Enter a budget in dollars, for example 500 or 2500.50");
  const n = Number(s);
  if (!(n >= MIN_BUDGET && n <= MAX_BUDGET)) throw fail(400, "Budget must be between $1 and $10,000,000");
  return Math.round(n * 100) / 100;
}

/* Rows of one filing -> one position per security (CUSIP + class + put/call). 13F tables often split one
 * security across several rows (by investment discretion or other managers). */
export function aggregateHoldings(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = [r.cusip, (r.title_of_class || "").toUpperCase(), r.put_call || ""].join("|");
    const v = Number(r.value_usd), sh = r.shares_or_principal == null ? null : Number(r.shares_or_principal);
    if (!by.has(k)) by.set(k, { cusip: r.cusip, issuer: r.issuer_name, titleOfClass: r.title_of_class || null, putCall: r.put_call || null, shareType: r.share_type || null, value: 0, shares: 0, sharesKnown: true, rows: 0 });
    const p = by.get(k);
    p.value += Number.isFinite(v) ? v : 0;
    if (sh == null || !Number.isFinite(sh) || (p.shareType && r.share_type && p.shareType !== r.share_type)) p.sharesKnown = false; else p.shares += sh;
    p.rows++;
  }
  return [...by.values()].map(p => ({ ...p, value: Math.round(p.value * 100) / 100, shares: p.sharesKnown ? p.shares : null })).sort((a, b) => b.value - a.value || a.cusip.localeCompare(b.cusip));
}

/* The simulation. Eligible: long share positions (type SH, no put/call) with a positive reported value.
 * Options are excluded (their 13F value is the underlying's, not the option's), principal-amount rows (PRN,
 * typically convertible notes) are excluded, and so is anything with no value. Dollars are allocated in
 * whole cents by largest remainder, so the allocations add up to the budget exactly. */
export function simulateAllocation(rows, budget) {
  const positions = aggregateHoldings(rows);
  const reportedTotal = positions.reduce((s, p) => s + p.value, 0);
  const eligible = [], excluded = [];
  for (const p of positions) {
    const reason = p.putCall ? "Option position (" + p.putCall.toLowerCase() + "): 13F reports the value of the underlying shares, not of the option"
      : p.shareType === "PRN" ? "Reported as principal amount (typically a bond or convertible note), not shares"
      : !(p.value > 0) ? "No positive reported value" : null;
    (reason ? excluded : eligible).push(reason ? { ...p, reason } : p);
  }
  const includedValue = eligible.reduce((s, p) => s + p.value, 0);
  const cents = Math.round(budget * 100);
  let allocations = [];
  if (includedValue > 0) {
    const raw = eligible.map(p => p.value / includedValue * cents);
    const floors = raw.map(Math.floor);
    let left = cents - floors.reduce((s, x) => s + x, 0);
    const order = raw.map((x, i) => ({ i, frac: x - floors[i] })).sort((a, b) => b.frac - a.frac || eligible[b.i].value - eligible[a.i].value || eligible[a.i].cusip.localeCompare(eligible[b.i].cusip));
    for (const o of order) { if (left <= 0) break; floors[o.i]++; left--; }
    allocations = eligible.map((p, i) => ({ cusip: p.cusip, issuer: p.issuer, titleOfClass: p.titleOfClass, reportedValue: p.value, shares: p.shares,
      weight: p.value / includedValue, weightOfReported: reportedTotal > 0 ? p.value / reportedTotal : null, dollars: floors[i] / 100 }));
  }
  const allocated = Math.round(allocations.reduce((s, a) => s + a.dollars * 100, 0)) / 100;
  return {
    budget, allocated, positions: positions.length, eligiblePositions: eligible.length,
    reportedValue: Math.round(reportedTotal * 100) / 100, includedValue: Math.round(includedValue * 100) / 100,
    coverage: reportedTotal > 0 ? includedValue / reportedTotal : 0,
    belowOneCent: allocations.filter(a => a.dollars === 0).length,
    allocations, excluded: excluded.map(p => ({ cusip: p.cusip, issuer: p.issuer, titleOfClass: p.titleOfClass, putCall: p.putCall, reportedValue: p.value, reason: p.reason })),
    method: "Each eligible position receives budget × (its reported value ÷ the total reported value of eligible positions), rounded to whole cents so the parts add up to the budget.",
    illustrative: true, executed: false, advice: false
  };
}

/* Changes between two quarters' positions (long shares only). Value changes include price moves, so only
 * share counts are classified. */
export function compareHoldings(current, previous) {
  const key = p => p.cusip + "|" + (p.titleOfClass || "").toUpperCase();
  const longs = list => new Map(list.filter(p => !p.putCall && p.shareType !== "PRN").map(p => [key(p), p]));
  const now = longs(current), before = longs(previous);
  const out = { new: [], exited: [], increased: [], decreased: [], unchanged: 0 };
  for (const [k, p] of now) {
    const b = before.get(k);
    if (!b) { out.new.push({ cusip: p.cusip, issuer: p.issuer, shares: p.shares, value: p.value }); continue; }
    if (p.shares == null || b.shares == null) continue;
    const d = p.shares - b.shares;
    if (d > 0) out.increased.push({ cusip: p.cusip, issuer: p.issuer, shares: p.shares, previousShares: b.shares, change: d, changePct: b.shares ? d / b.shares : null });
    else if (d < 0) out.decreased.push({ cusip: p.cusip, issuer: p.issuer, shares: p.shares, previousShares: b.shares, change: d, changePct: b.shares ? d / b.shares : null });
    else out.unchanged++;
  }
  for (const [k, b] of before) if (!now.has(k)) out.exited.push({ cusip: b.cusip, issuer: b.issuer, previousShares: b.shares, previousValue: b.value });
  for (const k of ["increased", "decreased"]) out[k].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  out.new.sort((a, b) => b.value - a.value); out.exited.sort((a, b) => b.previousValue - a.previousValue);
  return out;
}

/* One filing per quarter: the latest restatement amendment if there is one, else the original 13F-HR.
 * "New holdings" amendments add rows to a quarter and are listed so the reader knows. */
export function periodsFrom(filings) {
  const by = new Map();
  for (const f of filings) { const p = day(f.period_of_report); if (!by.has(p)) by.set(p, []); by.get(p).push(f); }
  const out = [];
  for (const [period, fs] of by) {
    const sorted = [...fs].sort((a, b) => String(day(b.filed_at)).localeCompare(String(day(a.filed_at))));
    const base = sorted.find(f => f.form_type === "13F-HR/A" && /RESTATEMENT/i.test(f.amendment_type || "")) || sorted.find(f => f.form_type === "13F-HR") || sorted[0];
    const supplements = sorted.filter(f => f !== base && /NEW HOLDINGS/i.test(f.amendment_type || "") && String(day(f.filed_at)) >= String(day(base.filed_at)));
    out.push({ period, base, supplements });
  }
  return out.sort((a, b) => b.period.localeCompare(a.period));
}

const filingView = f => ({ accession: f.accession, formType: f.form_type, amendmentType: f.amendment_type, periodOfReport: day(f.period_of_report), filedAt: day(f.filed_at),
  sourceUrl: f.source_url, infoTableUrl: f.info_table_url, entries: f.parsed_entries, declaredEntries: f.table_entry_total,
  reportedValue: Number(f.parsed_value_total), declaredValue: f.table_value_total == null ? null : Number(f.table_value_total), valueUnitAsFiled: f.value_unit,
  completeness: f.completeness, confidentialOmitted: f.confidential_omitted, otherManagersIncluded: f.other_managers_included, retrievedAt: iso(f.retrieved_at) });

export const COVERAGE_NOTES = Object.freeze([
  "Form 13F lists certain long positions in US-listed securities as of the last day of a quarter. It is filed up to 45 days later and is not a record of trades.",
  "It leaves out short positions, cash, most non-US securities and bonds, and anything the SEC allowed the manager to keep confidential, so it is not the manager's complete portfolio.",
  "Reported values are as of quarter end. Holdings may have changed since; nothing here shows what the manager owns today."
]);

const FILINGS_SQL = `SELECT * FROM form13f_filings WHERE manager_cik=$1 ORDER BY period_of_report DESC,filed_at DESC LIMIT 40`;
const HOLDINGS_SQL = `SELECT issuer_name,title_of_class,cusip,value_usd,shares_or_principal,share_type,put_call FROM form13f_holdings WHERE accession=$1 ORDER BY row_no LIMIT 20000`;

export async function listManagers(run = queryDb) {
  const rows = (await run(`SELECT m.cik,m.name,m.status,m.last_checked_at,f.accession,f.period_of_report,f.filed_at,f.parsed_entries,f.parsed_value_total,f.completeness,
      (SELECT count(*) FROM form13f_filings x WHERE x.manager_cik=m.cik)::integer AS filings
    FROM form13f_managers m LEFT JOIN LATERAL (SELECT * FROM form13f_filings f WHERE f.manager_cik=m.cik ORDER BY period_of_report DESC,filed_at DESC LIMIT 1) f ON true
    WHERE m.status='ok' AND f.accession IS NOT NULL ORDER BY m.name LIMIT 50`)).rows;
  const checked = (await run(`SELECT count(*)::integer AS managers,max(last_checked_at) AS last_checked_at,count(*) FILTER (WHERE status='error')::integer AS errors FROM form13f_managers`)).rows[0] || {};
  const managers = rows.map(r => ({ cik: r.cik, name: companyName(r.name, "CIK " + r.cik), filedName: r.name, latestPeriod: day(r.period_of_report), latestFiledAt: day(r.filed_at), entries: r.parsed_entries,
    reportedValue: Number(r.parsed_value_total), completeness: r.completeness, filings: r.filings, lastCheckedAt: iso(r.last_checked_at) }));
  return { available: managers.length > 0, managers, lastCheckedAt: iso(checked.last_checked_at),
    reason: managers.length ? null : checked.managers ? "Form 13F filings have not been imported successfully yet." : "Form 13F ingestion has not run yet on this deployment.",
    source: "SEC EDGAR Form 13F-HR", notes: COVERAGE_NOTES, illustrative: true, executed: false };
}

export async function managerDetail(cikRaw, run = queryDb, { holdingsLimit = 300 } = {}) {
  const cik = cik10(cikRaw);
  if (!cik) throw fail(400, "Invalid manager CIK");
  const m = (await run("SELECT cik,name,status,last_checked_at FROM form13f_managers WHERE cik=$1 AND status='ok'", [cik])).rows[0];
  if (!m) throw fail(404, "No imported Form 13F filings for this manager");
  const filings = (await run(FILINGS_SQL, [cik])).rows;
  const periods = periodsFrom(filings);
  if (!periods.length) throw fail(404, "No imported Form 13F filings for this manager");
  const current = periods[0];
  const [curRows, prevRows] = await Promise.all([run(HOLDINGS_SQL, [current.base.accession]), periods[1] ? run(HOLDINGS_SQL, [periods[1].base.accession]) : Promise.resolve(null)]);
  const positions = aggregateHoldings(curRows.rows);
  const total = positions.reduce((s, p) => s + p.value, 0);
  const prior = prevRows ? aggregateHoldings(prevRows.rows) : null;
  const notes = [...COVERAGE_NOTES];
  if (current.base.completeness !== "complete") notes.push(current.base.completeness === "totals_missing" ? "This filing's summary page has no totals to check the holdings against." : "The holdings parsed from this filing do not match the totals on its own summary page; some rows may be missing.");
  if (current.base.confidential_omitted) notes.push("The manager states that it omitted holdings under a confidential-treatment request.");
  if (current.supplements.length) notes.push("A later amendment (" + current.supplements.map(s => day(s.filed_at)).join(", ") + ") adds holdings for this quarter that are not included in these figures.");
  if (current.base.other_managers_included) notes.push("This report includes holdings for which other managers share investment discretion.");
  return {
    manager: { cik, name: companyName(m.name, "CIK " + cik), filedName: m.name, lastCheckedAt: iso(m.last_checked_at) },
    current: filingView(current.base), supplements: current.supplements.map(filingView),
    history: periods.map(p => ({ ...filingView(p.base), supplements: p.supplements.length })),
    positions: positions.slice(0, holdingsLimit).map(p => ({ ...p, weightOfReported: total > 0 ? p.value / total : null })),
    positionsTotal: positions.length, reportedValue: Math.round(total * 100) / 100,
    changes: prior ? { comparedTo: filingView(periods[1].base), ...compareHoldings(positions, prior),
      comparable: current.base.completeness === "complete" && periods[1].base.completeness === "complete" } : null,
    notes, source: "SEC EDGAR Form 13F-HR", illustrative: true, executed: false, advice: false
  };
}

export async function simulate(cikRaw, budgetRaw, run = queryDb, { accession = null } = {}) {
  const cik = cik10(cikRaw);
  if (!cik) throw fail(400, "Invalid manager CIK");
  const budget = parseBudget(budgetRaw);
  const filings = (await run(FILINGS_SQL, [cik])).rows;
  const periods = periodsFrom(filings);
  if (!periods.length) throw fail(404, "No imported Form 13F filings for this manager");
  const pick = accession ? periods.find(p => p.base.accession === String(accession)) : periods[0];
  if (!pick) throw fail(404, "That filing is not one of this manager's imported quarterly reports");
  const name = (await run("SELECT name FROM form13f_managers WHERE cik=$1", [cik])).rows[0]?.name || null;
  const rows = (await run(HOLDINGS_SQL, [pick.base.accession])).rows;
  const result = simulateAllocation(rows, budget);
  return { manager: { cik, name: companyName(name, "CIK " + cik), filedName: name }, filing: filingView(pick.base), ...result, notes: COVERAGE_NOTES,
    disclaimer: "Illustrative arithmetic on a quarterly public disclosure. Not a recommendation, not the manager's current portfolio, and no order is placed." };
}
