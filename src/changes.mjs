/* Insidir Changes: what changed for a company, a reporting person or a 13F manager, detected deterministically from
 * structured SEC records. A model never decides what changed; an explanation can only be asked for a Form 4 that
 * passed validation (src/ai-explain.mjs, cached and shared).
 *
 * Kinds of change, each with its evidence (src/evidence.mjs):
 *   form4            a new Form 4 in the window: who, what was reported (by transaction code), value as filed
 *   form4_amendment  a 4/A, with the date of the filing it amends
 *   role_change      the role filed for a reporting owner differs from the role on their previous filing there
 *   first_seen       a reporting owner's first Form 4 at an issuer in Insidir's records, only where Insidir holds that
 *                    issuer's filings from at least 60 days earlier (so it is not just the start of the import)
 *   financial_fact   the latest reported value of a metric against the same period a year earlier (XBRL)
 *   sec_filing       an 8-K (with its items), 10-K, 10-Q or other listed filing in EDGAR submissions
 *   holdings_13f     a 13F manager's new, exited, increased and decreased positions against the previous quarter
 * Flagged filings (validation errors) are left out and counted. */
import { query as queryDb } from "./db.mjs";
import { padCik, roleOf } from "./sec-directory.mjs";
import { evidence, form4LineEvidence } from "./evidence.mjs";
import { companyFactChanges, resolveCompany, extractFilings } from "./intelligence.mjs";
import { managerDetail } from "./intelligence-mirror.mjs";
import { codeLabel } from "./intelligence-common.mjs";

const fail = (status, message) => Object.assign(new Error(message), { status });
const day = v => v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
export const MAX_CHANGES = 80, FIRST_SEEN_DAYS = 60;
// Figures exactly as filed: whole numbers without decimals, others to the cent (dollars) or up to four places.
const count = n => Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });
const money = n => (n < 0 ? "−$" : "$") + Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });

const FILINGS_SQL = `SELECT f.accession,f.form_type,f.issuer_cik,f.issuer_name,f.ticker,f.published_at,f.period_of_report,f.source_url,f.is_amendment,f.original_filed_on,f.rule_10b5_1,f.validation_status,
    (SELECT json_agg(json_build_object('owner_cik',o.owner_cik,'owner_name',o.owner_name,'is_director',o.is_director,'is_officer',o.is_officer,'officer_title',o.officer_title,
      'is_ten_percent_owner',o.is_ten_percent_owner,'other_text',o.other_text) ORDER BY o.owner_cik) FROM sec_filing_owners o WHERE o.accession=f.accession) AS owners
  FROM sec_filings f
  WHERE f.ingest_status='parsed' AND f.published_at>=now()-make_interval(days=>$2)
    AND (($3='issuer' AND f.issuer_cik=$1) OR ($3='owner' AND EXISTS(SELECT 1 FROM sec_filing_owners o WHERE o.accession=f.accession AND o.owner_cik=$1)))
  ORDER BY f.published_at DESC, f.accession LIMIT 200`;
const LINES_SQL = `SELECT accession,owner_cik,owner_name,transaction_date,security_title,transaction_code,acquired_disposed,category,derivative,shares,price_per_share,estimated_value,shares_after,source_url
  FROM sec_transactions WHERE accession=ANY($1::text[]) ORDER BY accession,id`;
// Each owner's filings at one issuer in date order, with the role filed on each: role changes and first appearances.
const HISTORY_SQL = `SELECT o.owner_cik,o.owner_name,f.issuer_cik,f.issuer_name,f.accession,f.published_at,f.source_url,f.form_type,
    o.is_director,o.is_officer,o.officer_title,o.is_ten_percent_owner,o.other_text,
    (SELECT min(x.published_at) FROM sec_filings x WHERE x.issuer_cik=f.issuer_cik AND x.ingest_status='parsed') AS issuer_first_at
  FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession
  WHERE f.ingest_status='parsed' AND f.validation_status IS DISTINCT FROM 'flagged'
    AND (($2='issuer' AND f.issuer_cik=$1) OR ($2='owner' AND o.owner_cik=$1))
  ORDER BY o.owner_cik,f.issuer_cik,f.published_at,f.accession`;

/* What one Form 4 reported, in words, from its lines (codes named, values as filed, never summed across codes). */
export function describeForm4(lines) {
  const by = new Map();
  for (const l of lines) {
    const k = (l.derivative ? "d" : "n") + (l.transaction_code || "?");
    if (!by.has(k)) by.set(k, { code: l.transaction_code || "?", derivative: !!l.derivative, lines: 0, shares: 0, value: 0, valued: 0 });
    const g = by.get(k); g.lines++; g.shares += Number(l.shares) || 0;
    if (l.estimated_value != null) { g.value += Number(l.estimated_value); g.valued++; }
  }
  return [...by.values()].map(g => (g.derivative ? "derivative " : "") + codeLabel(g.code).toLowerCase() + ": " + count(g.shares) + (g.derivative ? " securities" : " shares") +
    (g.valued ? ", " + money(g.value) + " as filed" + (g.valued < g.lines ? " (" + (g.lines - g.valued) + " line(s) with no price)" : "") : "")).join("; ");
}

export async function changes(cikInput, { run = queryDb, days = 90, fetcher, loadCompany = resolveCompany, factChanges = companyFactChanges, manager = managerDetail, now = Date.now() } = {}) {
  const cik = padCik(cikInput);
  if (!cik) throw fail(400, "Give a SEC CIK");
  const window = Math.max(1, Math.min(365, Math.trunc(Number(days) || 90)));
  const since = new Date(now - window * 86400_000).toISOString().slice(0, 10);
  const ent = (await run("SELECT cik,name,kind,tickers,listed FROM sec_entities WHERE cik=$1", [cik])).rows[0] || null;
  const asIssuer = (await run("SELECT count(*)::integer AS n FROM sec_filings WHERE issuer_cik=$1 AND ingest_status='parsed'", [cik])).rows[0].n;
  const asOwner = (await run("SELECT count(*)::integer AS n FROM sec_filing_owners WHERE owner_cik=$1", [cik])).rows[0].n;
  const isManager = (await run("SELECT 1 FROM form13f_managers WHERE cik=$1 AND status='ok'", [cik]).catch(() => ({ rows: [] }))).rows.length > 0;
  if (!ent && !asIssuer && !asOwner && !isManager) throw fail(404, "No imported SEC records for this CIK");
  const scope = asIssuer >= asOwner ? "issuer" : "owner";
  const items = [], gaps = [];

  // Form 4 and 4/A.
  const filings = (await run(FILINGS_SQL, [cik, window, scope])).rows;
  const flagged = filings.filter(f => f.validation_status === "flagged");
  const good = filings.filter(f => f.validation_status !== "flagged");
  if (flagged.length) gaps.push(flagged.length + " filing(s) in this window failed Insidir's validation checks and are not listed; they are shown with the reasons on their filing pages.");
  const lines = good.length ? (await run(LINES_SQL, [good.map(f => f.accession)])).rows : [];
  const linesBy = new Map();
  for (const l of lines) { if (!linesBy.has(l.accession)) linesBy.set(l.accession, []); linesBy.get(l.accession).push(l); }
  for (const f of good) {
    const ls = linesBy.get(f.accession) || [], owners = f.owners || [];
    const who = owners.map(o => o.owner_name).filter(Boolean).slice(0, 3).join(", ") + (owners.length > 3 ? " and " + (owners.length - 3) + " more" : "");
    const filingEvidence = evidence({ source: "SEC Form " + f.form_type, title: "Form " + f.form_type + " for " + (f.issuer_name || "issuer"), entity: { name: f.issuer_name, cik: f.issuer_cik },
      filedOn: f.published_at, period: f.period_of_report ? { start: f.period_of_report, end: f.period_of_report, type: "period of report" } : null, url: f.source_url });
    items.push({ kind: f.is_amendment ? "form4_amendment" : "form4", date: day(f.published_at), accession: f.accession,
      subject: { name: f.issuer_name, cik: f.issuer_cik, ticker: f.ticker },
      title: (who || "A reporting owner") + (f.is_amendment ? " amended a Form 4" + (f.original_filed_on ? " first filed on " + day(f.original_filed_on) : "") : " filed a Form 4") + " for " + (f.issuer_name || "the issuer"),
      detail: (ls.length ? describeForm4(ls) + "." : "No transaction lines (holdings only).") + (f.rule_10b5_1 ? " Marked as made under a Rule 10b5-1 trading plan." : ""),
      explainable: true, evidence: [filingEvidence, ...ls.slice(0, 4).map(l => form4LineEvidence(l, f))].filter(Boolean) });
  }

  // Role changes and first appearances, from each owner's filing history at each issuer.
  const hist = (await run(HISTORY_SQL, [cik, scope])).rows;
  for (let i = 0; i < hist.length; i++) {
    const r = hist[i], prev = i > 0 && hist[i - 1].owner_cik === r.owner_cik && hist[i - 1].issuer_cik === r.issuer_cik ? hist[i - 1] : null;
    if (day(r.published_at) < since) continue;
    const ev = (row, label) => evidence({ source: "SEC Form " + row.form_type, title: label + ": " + (row.issuer_name || "issuer"), entity: { name: row.owner_name, cik: row.owner_cik },
      filedOn: row.published_at, field: "reportingOwner/reportingOwnerRelationship", value: roleOf(row) || "not stated", url: row.source_url });
    if (prev && (roleOf(prev) || "") !== (roleOf(r) || "")) {
      items.push({ kind: "role_change", date: day(r.published_at), accession: r.accession, subject: { name: r.issuer_name, cik: r.issuer_cik },
        title: r.owner_name + "'s filed role at " + (r.issuer_name || "the issuer") + " changed", detail: "From " + (roleOf(prev) || "not stated") + " to " + (roleOf(r) || "not stated") + ", as filed.",
        evidence: [ev(prev, "Previous filing"), ev(r, "This filing")].filter(Boolean) });
    } else if (!prev && r.issuer_first_at && (new Date(r.published_at) - new Date(r.issuer_first_at)) >= FIRST_SEEN_DAYS * 86400_000) {
      items.push({ kind: "first_seen", date: day(r.published_at), accession: r.accession, subject: { name: r.issuer_name, cik: r.issuer_cik },
        title: "First Form 4 from " + r.owner_name + " at " + (r.issuer_name || "the issuer") + " in Insidir's records",
        detail: "Filed as " + (roleOf(r) || "role not stated") + ". Insidir holds this issuer's Form 4s from " + day(r.issuer_first_at) + "; earlier filings outside that period are not checked.",
        evidence: [ev(r, "First filing")].filter(Boolean) });
    }
  }

  // Financial facts and listed SEC filings, for a company with a ticker (EDGAR, cached like the company page).
  const ticker = ent?.tickers?.[0] || filings.find(f => f.ticker)?.ticker || null;
  if (scope === "issuer") {
    try {
      const facts = await withTimeout(factChanges(cik, ...(fetcher ? [fetcher] : [])), 6000);
      for (const c of facts) {
        const sign = c.change > 0 ? "up" : c.change < 0 ? "down" : "unchanged";
        const fmt = v => c.unit === "USD" ? money(v) : count(v) + " " + c.unit;
        items.push({ kind: "financial_fact", date: c.current.filedAt, accession: c.current.accession, subject: { name: ent?.name, cik, ticker },
          title: c.label + " for the " + c.current.periodType.replace("-", " ") + " ended " + c.current.end + ": " + fmt(c.current.value),
          detail: sign === "unchanged" ? "Unchanged from a year earlier." : "Against " + fmt(c.prior.value) + " for the " + c.prior.periodType.replace("-", " ") + " ended " + c.prior.end + " (" + sign + " " + fmt(Math.abs(c.change)) + (c.changePct != null ? ", " + (Math.abs(c.changePct) * 100).toFixed(1) + "%" : "") + ").",
          evidence: [evidence({ source: "SEC XBRL company facts", title: c.label + " (" + c.current.form + ")", entity: { name: ent?.name, cik }, filedOn: c.current.filedAt,
            period: { start: c.current.start, end: c.current.end, type: c.current.periodType }, field: c.concept, value: c.current.value, units: c.unit, methodology: c.methodology, url: c.current.sourceUrl }),
          evidence({ source: "SEC XBRL company facts", title: c.label + " a year earlier (" + c.prior.form + ")", entity: { name: ent?.name, cik }, filedOn: c.prior.filedAt,
            period: { start: c.prior.start, end: c.prior.end, type: c.prior.periodType }, field: c.concept, value: c.prior.value, units: c.unit, url: c.prior.sourceUrl })].filter(Boolean) });
      }
    } catch { gaps.push("Financial facts could not be read from SEC company facts just now."); }
    if (ticker) {
      try {
        const resolved = await withTimeout(loadCompany(ticker, ...(fetcher ? [fetcher] : [])), 6000);
        for (const x of resolved ? extractFilings(resolved.submissions, cik, 40) : []) {
          if (x.filedAt < since || /^4/.test(x.form)) continue;
          items.push({ kind: "sec_filing", date: x.filedAt, accession: x.accession, subject: { name: ent?.name || resolved.company?.name, cik, ticker },
            title: "Form " + x.form + " filed" + (x.reportDate ? " for " + x.reportDate : ""), detail: x.items?.length ? x.items.map(i => "Item " + i.code + ": " + i.label).join("; ") : x.headline || "",
            evidence: [evidence({ source: "SEC EDGAR submissions", title: "Form " + x.form, entity: { name: ent?.name, cik }, filedOn: x.filedAt, url: x.sourceUrl })].filter(Boolean) });
        }
      } catch { gaps.push("The EDGAR filing list could not be read just now."); }
    }
  }

  // 13F: a manager's positions against the previous quarter.
  if (isManager) {
    try {
      const d = await manager(cik, run, { holdingsLimit: 0 });
      const c = d.changes;
      if (c) {
        const ev = evidence({ source: "SEC Form " + d.current.formType, title: "13F for the quarter ended " + d.current.periodOfReport, entity: { name: d.manager.name, cik }, filedOn: d.current.filedAt,
          period: { start: null, end: d.current.periodOfReport, type: "quarter end" }, url: d.current.sourceUrl });
        const evPrev = evidence({ source: "SEC Form " + c.comparedTo.formType, title: "13F for the quarter ended " + c.comparedTo.periodOfReport, entity: { name: d.manager.name, cik }, filedOn: c.comparedTo.filedAt,
          period: { start: null, end: c.comparedTo.periodOfReport, type: "quarter end" }, url: c.comparedTo.sourceUrl });
        const list = (arr, f) => arr.slice(0, 5).map(f).join("; ") || "none";
        items.push({ kind: "holdings_13f", date: d.current.filedAt, accession: d.current.accession, subject: { name: d.manager.name, cik },
          title: d.manager.name + ": positions at " + d.current.periodOfReport + " against " + c.comparedTo.periodOfReport,
          detail: `New ${c.new.length} (${list(c.new, p => p.issuer)}), exited ${c.exited.length} (${list(c.exited, p => p.issuer)}), more shares ${c.increased.length}, fewer shares ${c.decreased.length}.` +
            (c.comparable ? "" : " One of the two filings does not match its own totals, so the comparison may be incomplete.") + " Form 13F is a quarter-end snapshot filed up to 45 days later, not a record of trades.",
          evidence: [ev, evPrev].filter(Boolean) });
      }
    } catch { gaps.push("13F holdings could not be compared."); }
  }

  items.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.accession).localeCompare(String(a.accession)));
  if (items.length > MAX_CHANGES) gaps.push(`Showing the ${MAX_CHANGES} most recent changes.`);
  gaps.push("Changes are detected from Insidir's imported filings (docs/COVERAGE.md) and SEC company facts; SEC filings are published after the events they report.");
  return { subject: { cik, name: ent?.name || filings[0]?.issuer_name || null, kind: ent?.kind || (scope === "issuer" ? "company" : "person"), ticker }, window: { days: window, since },
    items: items.slice(0, MAX_CHANGES), counts: Object.fromEntries([...new Set(items.map(i => i.kind))].map(k => [k, items.filter(i => i.kind === k).length])),
    gaps, method: "Detected by rules from structured SEC fields. No model decides what changed.", generatedAt: new Date(now).toISOString() };
}
