/* Insidir Connections: who is connected to whom, according to filed SEC records only.
 *
 * Every edge is built from structured fields keyed by SEC CIK and accession, never inferred from text or by a model:
 *   reports_at     a reporting owner named on a Form 4 / 4/A for an issuer (sec_filing_owners), with the role as
 *                  filed on the latest of those filings, the first and latest filing dates and how many filings
 *   filed_jointly  two reporting owners named on the same Form 4 (a joint filing)
 * Each edge carries its evidence (src/evidence.mjs): the first and the latest filing behind it, linked to EDGAR.
 *
 * Progressive loading: depth 1 is the subject's direct connections; expanding a node asks for that node's own
 * connections (the page merges them). asOf limits every edge to filings on or before that date, so the map shows the
 * relationships as they were recorded at the time. "Last filed" is a date, not a claim that a role has ended: Form 4
 * does not record when someone leaves a role. */
import { query as queryDb } from "./db.mjs";
import { padCik, roleOf, classifyOwnerName, entityUrl } from "./sec-directory.mjs";
import { evidence } from "./evidence.mjs";

const fail = (status, message) => Object.assign(new Error(message), { status });
const day = v => v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
export const MAX_NODES = 60;

const OWNERS_OF_ISSUER = `SELECT o.owner_cik,
    (array_agg(o.owner_name ORDER BY f.published_at DESC))[1] AS name,
    (array_agg(o.is_director ORDER BY f.published_at DESC))[1] AS is_director,
    (array_agg(o.is_officer ORDER BY f.published_at DESC))[1] AS is_officer,
    (array_agg(o.officer_title ORDER BY f.published_at DESC))[1] AS officer_title,
    (array_agg(o.is_ten_percent_owner ORDER BY f.published_at DESC))[1] AS is_ten_percent_owner,
    (array_agg(o.other_text ORDER BY f.published_at DESC))[1] AS other_text,
    count(*)::integer AS filings, min(f.published_at) AS first_at, max(f.published_at) AS last_at,
    (array_agg(f.source_url ORDER BY f.published_at ASC))[1] AS first_url, (array_agg(f.form_type ORDER BY f.published_at ASC))[1] AS first_form,
    (array_agg(f.source_url ORDER BY f.published_at DESC))[1] AS last_url, (array_agg(f.form_type ORDER BY f.published_at DESC))[1] AS last_form,
    (array_agg(f.issuer_name ORDER BY f.published_at DESC))[1] AS issuer_name, (array_agg(f.ticker ORDER BY f.published_at DESC))[1] AS ticker
  FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession
  WHERE f.issuer_cik=$1 AND f.ingest_status='parsed' AND ($2::date IS NULL OR f.published_at<($2::date+1))
  GROUP BY o.owner_cik ORDER BY max(f.published_at) DESC, o.owner_cik LIMIT $3`;
const ISSUERS_OF_OWNERS = `SELECT o.owner_cik, f.issuer_cik,
    (array_agg(o.owner_name ORDER BY f.published_at DESC))[1] AS name,
    (array_agg(o.is_director ORDER BY f.published_at DESC))[1] AS is_director,
    (array_agg(o.is_officer ORDER BY f.published_at DESC))[1] AS is_officer,
    (array_agg(o.officer_title ORDER BY f.published_at DESC))[1] AS officer_title,
    (array_agg(o.is_ten_percent_owner ORDER BY f.published_at DESC))[1] AS is_ten_percent_owner,
    (array_agg(o.other_text ORDER BY f.published_at DESC))[1] AS other_text,
    count(*)::integer AS filings, min(f.published_at) AS first_at, max(f.published_at) AS last_at,
    (array_agg(f.source_url ORDER BY f.published_at ASC))[1] AS first_url, (array_agg(f.form_type ORDER BY f.published_at ASC))[1] AS first_form,
    (array_agg(f.source_url ORDER BY f.published_at DESC))[1] AS last_url, (array_agg(f.form_type ORDER BY f.published_at DESC))[1] AS last_form,
    (array_agg(f.issuer_name ORDER BY f.published_at DESC))[1] AS issuer_name, (array_agg(f.ticker ORDER BY f.published_at DESC))[1] AS ticker
  FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession
  WHERE o.owner_cik=ANY($1::text[]) AND f.ingest_status='parsed' AND ($2::date IS NULL OR f.published_at<($2::date+1)) AND ($3::text IS NULL OR f.issuer_cik<>$3)
  GROUP BY o.owner_cik, f.issuer_cik ORDER BY max(f.published_at) DESC LIMIT $4`;
const JOINT = `SELECT a.owner_cik AS x, b.owner_cik AS y, count(*)::integer AS filings, min(f.published_at) AS first_at, max(f.published_at) AS last_at,
    (array_agg(f.source_url ORDER BY f.published_at ASC))[1] AS first_url, (array_agg(f.source_url ORDER BY f.published_at DESC))[1] AS last_url,
    (array_agg(b.owner_name ORDER BY f.published_at DESC))[1] AS y_name, (array_agg(f.issuer_name ORDER BY f.published_at DESC))[1] AS issuer_name
  FROM sec_filing_owners a JOIN sec_filing_owners b ON b.accession=a.accession AND b.owner_cik<>a.owner_cik JOIN sec_filings f ON f.accession=a.accession
  WHERE a.owner_cik=ANY($1::text[]) AND ($2::boolean OR b.owner_cik=ANY($1::text[])) AND f.ingest_status='parsed' AND ($3::date IS NULL OR f.published_at<($3::date+1))
  GROUP BY a.owner_cik, b.owner_cik ORDER BY count(*) DESC LIMIT $4`;

function edgeEvidence(r, entity) {
  const first = evidence({ source: "SEC Form " + (r.first_form || "4"), title: "First imported filing: " + (r.issuer_name || "issuer"), entity, filedOn: r.first_at, url: r.first_url });
  const last = r.last_url !== r.first_url ? evidence({ source: "SEC Form " + (r.last_form || "4"), title: "Latest imported filing: " + (r.issuer_name || "issuer"), entity, filedOn: r.last_at, url: r.last_url }) : null;
  return [first, last].filter(Boolean);
}
const ownerNode = (cik, name, entity) => {
  const kind = entity?.kind === "company" || entity?.kind === "organization" || entity?.kind === "person" ? entity.kind : classifyOwnerName(name);
  return { id: cik, name: name || entity?.name || "CIK " + cik, kind: kind === "company" ? "organization" : kind, url: (kind === "company" ? "entity.html?cik=" : "person.html?cik=") + cik };
};
const issuerNode = (cik, name, ticker, entity) => ({ id: cik, name: entity?.name || name || "CIK " + cik, kind: "company", ticker: ticker || entity?.tickers?.[0] || null,
  url: entity ? entityUrl({ ...entity, kind: "company" }) : ticker ? "company.html?ticker=" + encodeURIComponent(ticker) : "entity.html?cik=" + cik });

/* The connections around one CIK. Returns {subject, nodes, edges, truncated, asOf, gaps, method}. */
export async function connections(cikInput, { run = queryDb, asOf = null, limit = 40 } = {}) {
  const cik = padCik(cikInput);
  if (!cik) throw fail(400, "Give a SEC CIK");
  if (asOf != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(asOf))) throw fail(400, "asOf must be a date (YYYY-MM-DD)");
  const cap = Math.max(5, Math.min(MAX_NODES, Number(limit) || 40));
  const ent = (await run("SELECT cik,name,kind,tickers,listed,is_issuer,is_reporting_owner FROM sec_entities WHERE cik=$1", [cik])).rows[0] || null;
  const issuerFilings = (await run("SELECT count(*)::integer AS n FROM sec_filings WHERE issuer_cik=$1 AND ingest_status='parsed'", [cik])).rows[0].n;
  const ownerFilings = (await run("SELECT count(*)::integer AS n FROM sec_filing_owners WHERE owner_cik=$1", [cik])).rows[0].n;
  if (!ent && !issuerFilings && !ownerFilings) throw fail(404, "No imported SEC records for this CIK");
  const nodes = new Map(), edges = [], gaps = [];
  const put = n => { if (!nodes.has(n.id)) nodes.set(n.id, n); return n; };
  const entities = async ciks => new Map((await run("SELECT cik,name,kind,tickers,listed,is_issuer,is_reporting_owner FROM sec_entities WHERE cik=ANY($1::text[])", [ciks])).rows.map(r => [r.cik, r]));
  let subject;
  if (issuerFilings >= ownerFilings) {
    // A company: the reporting owners on its Form 4s, then which of them filed jointly.
    const owners = (await run(OWNERS_OF_ISSUER, [cik, asOf, cap + 1])).rows;
    const first = owners[0];
    subject = put(issuerNode(cik, first?.issuer_name || ent?.name, first?.ticker, ent));
    subject.role = "subject";
    const known = await entities(owners.map(o => o.owner_cik));
    for (const o of owners.slice(0, cap)) {
      const n = put(ownerNode(o.owner_cik, o.name, known.get(o.owner_cik)));
      edges.push({ from: n.id, to: cik, type: "reports_at", role: roleOf(o), filings: o.filings, firstFiledOn: day(o.first_at), lastFiledOn: day(o.last_at),
        evidence: edgeEvidence(o, { name: o.name, cik: o.owner_cik }) });
    }
    if (owners.length > cap) gaps.push(`Showing the ${cap} reporting owners who filed most recently; more are in the imported filings.`);
    const ids = owners.slice(0, cap).map(o => o.owner_cik);
    for (const j of (await run(JOINT, [ids, false, asOf, 60])).rows) {
      if (j.x > j.y) continue; // each pair once
      edges.push({ from: j.x, to: j.y, type: "filed_jointly", role: null, filings: j.filings, firstFiledOn: day(j.first_at), lastFiledOn: day(j.last_at),
        evidence: edgeEvidence({ ...j, first_form: "4", last_form: "4" }, null) });
    }
  } else {
    // A reporting owner: the issuers it reports at, and the owners it filed jointly with.
    const rows = (await run(ISSUERS_OF_OWNERS, [[cik], asOf, null, cap + 1])).rows;
    subject = put(ownerNode(cik, rows[0]?.name || ent?.name, ent));
    subject.role = "subject";
    const known = await entities(rows.map(r => r.issuer_cik));
    for (const r of rows.slice(0, cap)) {
      put(issuerNode(r.issuer_cik, r.issuer_name, r.ticker, known.get(r.issuer_cik)));
      edges.push({ from: cik, to: r.issuer_cik, type: "reports_at", role: roleOf(r), filings: r.filings, firstFiledOn: day(r.first_at), lastFiledOn: day(r.last_at),
        evidence: edgeEvidence(r, { name: r.name, cik }) });
    }
    if (rows.length > cap) gaps.push(`Showing the ${cap} issuers with the most recent filings.`);
    const joint = (await run(JOINT, [[cik], true, asOf, Math.max(0, cap - nodes.size) + 1])).rows;
    const knownOwners = await entities(joint.map(j => j.y));
    for (const j of joint) {
      if (nodes.size >= cap + 1) { gaps.push("More joint filers exist than are shown."); break; }
      put(ownerNode(j.y, j.y_name, knownOwners.get(j.y)));
      edges.push({ from: cik, to: j.y, type: "filed_jointly", role: null, filings: j.filings, firstFiledOn: day(j.first_at), lastFiledOn: day(j.last_at),
        evidence: edgeEvidence({ ...j, first_form: "4", last_form: "4" }, null) });
    }
  }
  if (!edges.length) gaps.push("No Form 4 relationships are in the imported filings" + (asOf ? " on or before " + asOf : "") + ".");
  gaps.push("Relationships come from Form 4 filings imported by Insidir (docs/COVERAGE.md); a role with no recent filing may have ended, which Form 4 does not record.");
  return { subject: { id: subject.id, name: subject.name, kind: subject.kind, url: subject.url }, nodes: [...nodes.values()], edges, asOf, gaps,
    method: "Built from SEC Form 4 reporting-owner records (CIK and accession). No model is involved.", generatedAt: new Date().toISOString() };
}
