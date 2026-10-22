/* The SEC entity directory (sql/018_coverage.sql): every CIK Insidir knows of, from four authoritative sources.
 *
 *   1. The SEC's company ticker list (https://www.sec.gov/files/company_tickers_exchange.json): listed operating
 *      companies, their tickers and exchanges. Synced daily. A CIK that leaves the list is marked unlisted, never
 *      deleted, and the tickers it had stay in sec_ticker_history.
 *   2. Imported Form 4 filings: every issuer and every reporting owner (joint filers included), with the names they
 *      filed under, how many filings each appears on and their latest role. Incremental after each import.
 *   3. EDGAR submissions (data.sec.gov/submissions/CIK##########.json), fetched on demand for one CIK: the SEC's
 *      current name, former names, tickers, SIC code, entity type and whether the CIK files ownership reports.
 *   4. EDGAR's entity lookup (efts.sec.gov/LATEST/search-index), queried on demand when a search finds little
 *      locally: names and CIKs of any EDGAR filer, companies and individuals alike.
 *
 * Kinds. A company is a CIK on the ticker list, an issuer on an imported Form 4, or an EDGAR "operating" filer.
 * A reporting owner that is not a company is a person or an organization, told apart only by the name as filed
 * (kind_basis 'filed_name_pattern'); nothing here invents a biography, position or relationship. A CIK seen only in
 * EDGAR's name lookup is 'unknown' until its submissions are read. */
import { secFetch } from "./sec.mjs";
import { query as queryDb } from "./db.mjs";
import { createCache } from "./cache.mjs";
import { readableName } from "./plain-language.mjs";

export const TICKER_LIST_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
export const padCik = value => {
  const s = String(value ?? "").trim().replace(/^0+/, "");
  return /^\d{1,10}$/.test(s) ? s.padStart(10, "0") : null;
};
export const normalizeName = value => String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase()
  .replace(/&/g, " AND ").replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ").slice(0, 200);
export const normalizeTicker = value => {
  const t = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t) ? t : null;
};

// Words that mark a filed name as an organization's (fund, trust, partnership, company) rather than a person's.
const ORG_WORDS = ["INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "COMPANIES", "LLC", "L L C", "LP", "L P", "LLP", "LTD",
  "LIMITED", "PLC", "AG", "SA", "S A", "NV", "N V", "BV", "GMBH", "SARL", "FUND", "FUNDS", "TRUST", "PARTNERS", "PARTNERSHIP",
  "CAPITAL", "HOLDINGS", "HOLDING", "MANAGEMENT", "GROUP", "ADVISORS", "ADVISERS", "ASSOCIATES", "BANK", "BANCORP", "FOUNDATION",
  "VENTURES", "INVESTMENTS", "INVESTORS", "INVESTMENT", "SECURITIES", "ENTERPRISES", "FINANCIAL", "ASSET", "ASSETS", "EQUITY",
  "OPPORTUNITY", "OPPORTUNITIES", "MASTER", "OFFSHORE", "SPV", "ENDOWMENT", "PENSION", "INSURANCE", "LABS", "TECHNOLOGIES",
  "SYSTEMS", "INDUSTRIES", "ACQUISITION", "SPONSOR", "UNIVERSITY", "ESTATE"];
const ORG_RE = new RegExp("(^| )(" + ORG_WORDS.join("|") + ")( |$)");
export function classifyOwnerName(name) {
  return ORG_RE.test(normalizeName(name)) ? "organization" : "person";
}

/* Stable display role from one Form 4 owner row: "Director", "Officer: CEO", "10% owner", joined. */
export function roleOf(o) {
  const parts = [];
  if (o?.is_director || o?.isDirector) parts.push("Director");
  const title = String(o?.officer_title ?? o?.officerTitle ?? "").trim();
  if (o?.is_officer || o?.isOfficer) parts.push(title ? "Officer: " + title.slice(0, 80) : "Officer");
  if (o?.is_ten_percent_owner || o?.isTenPercentOwner) parts.push("10% owner");
  const other = String(o?.other_text ?? o?.otherText ?? "").trim();
  if (!parts.length && other) parts.push(other.slice(0, 80));
  return parts.join(" · ") || null;
}

async function startRun(run, job) {
  return (await run("INSERT INTO sec_sync_runs(job) VALUES($1) RETURNING id", [job])).rows[0].id;
}
async function finishRun(run, id, status, stats, error) {
  await run("UPDATE sec_sync_runs SET finished_at=now(),status=$2,stats=$3,error_message=$4 WHERE id=$1",
    [id, status, JSON.stringify(stats || {}), error ? String(error).slice(0, 500) : null]);
}

/* Names into sec_entity_names, deduplicated by (cik, normalized name, kind). rows: [{cik,name,kind,source}] */
export async function upsertNames(run, rows) {
  const seen = new Set(), c = [], n = [], k = [], s = [], norm = [];
  for (const r of rows) {
    const cik = padCik(r.cik), nm = String(r.name ?? "").trim().slice(0, 200), nk = r.kind, key = normalizeName(nm);
    if (!cik || !key || !nm) continue;
    const id = cik + "|" + key + "|" + nk;
    if (seen.has(id)) continue;
    seen.add(id); c.push(cik); n.push(nm); k.push(nk); s.push(r.source); norm.push(key);
  }
  for (let i = 0; i < c.length; i += 1000) {
    await run(`INSERT INTO sec_entity_names(cik,name,norm,name_kind,source)
      SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[])
      ON CONFLICT (cik,norm,name_kind) DO UPDATE SET last_seen_at=now(),name=EXCLUDED.name`,
      [c.slice(i, i + 1000), n.slice(i, i + 1000), norm.slice(i, i + 1000), k.slice(i, i + 1000), s.slice(i, i + 1000)]);
  }
  return c.length;
}

/* ---------- 1. the SEC company ticker list ---------- */
export function parseTickerList(data) {
  const fields = Array.isArray(data?.fields) ? data.fields.map(String) : null;
  if (!fields || !Array.isArray(data?.data)) throw new Error("SEC ticker list: unexpected format");
  const at = name => fields.indexOf(name);
  const [ci, ni, ti, ei] = [at("cik"), at("name"), at("ticker"), at("exchange")];
  if (ci < 0 || ni < 0 || ti < 0) throw new Error("SEC ticker list: missing cik/name/ticker fields");
  const byCik = new Map();
  let rows = 0, rejected = 0;
  for (const row of data.data) {
    const cik = padCik(row?.[ci]), ticker = normalizeTicker(row?.[ti]), name = String(row?.[ni] ?? "").trim().slice(0, 200);
    if (!cik || !ticker || !name) { rejected++; continue; }
    rows++;
    const e = byCik.get(cik) || { cik, name, tickers: [], exchanges: [] };
    // The list orders an issuer's primary listing first; keep that order.
    if (!e.tickers.includes(ticker)) { e.tickers.push(ticker); e.exchanges.push(ei >= 0 && row[ei] ? String(row[ei]).slice(0, 40) : ""); }
    byCik.set(cik, e);
  }
  return { companies: [...byCik.values()], rows, rejected };
}

export async function syncCompanyDirectory({ run = queryDb, fetcher = secFetch, minimumCompanies = 5000 } = {}) {
  const id = await startRun(run, "company-directory");
  try {
    const { companies, rows, rejected } = parseTickerList(await fetcher(TICKER_LIST_URL, { json: true }));
    // A truncated or empty download must not mark thousands of companies as delisted.
    if (companies.length < minimumCompanies) throw new Error(`SEC ticker list returned ${companies.length} companies (expected at least ${minimumCompanies}); nothing changed`);
    const started = (await run("SELECT now() AS t")).rows[0].t;
    for (let i = 0; i < companies.length; i += 1000) {
      const part = companies.slice(i, i + 1000);
      // Name changes keep the name the CIK had before as a searchable name (it stays in sec_entity_names).
      await run(`INSERT INTO sec_entities(cik,name,kind,kind_basis,is_issuer,listed,tickers,exchanges,sources,listed_seen_at)
        SELECT c,n,'company','sec_ticker_list',true,true,string_to_array(t,'|'),string_to_array(e,'|'),ARRAY['sec_ticker_list'],now()
        FROM unnest($1::text[],$2::text[],$3::text[],$4::text[]) AS x(c,n,t,e)
        ON CONFLICT (cik) DO UPDATE SET name=EXCLUDED.name,kind='company',
          kind_basis=CASE WHEN sec_entities.kind='company' AND sec_entities.kind_basis IS NOT NULL THEN sec_entities.kind_basis ELSE 'sec_ticker_list' END,
          is_issuer=true,listed=true,tickers=EXCLUDED.tickers,exchanges=EXCLUDED.exchanges,
          sources=ARRAY(SELECT DISTINCT unnest(sec_entities.sources||EXCLUDED.sources)),last_seen_at=now(),listed_seen_at=now(),delisted_at=NULL`,
        [part.map(c => c.cik), part.map(c => c.name), part.map(c => c.tickers.join("|")), part.map(c => c.exchanges.join("|"))]);
      const th = part.flatMap(c => c.tickers.map((t, j) => [c.cik, t, c.exchanges[j] || null]));
      await run(`INSERT INTO sec_ticker_history(cik,ticker,exchange) SELECT * FROM unnest($1::text[],$2::text[],$3::text[])
        ON CONFLICT (cik,ticker) DO UPDATE SET last_seen_at=now(),exchange=COALESCE(EXCLUDED.exchange,sec_ticker_history.exchange)`,
        [th.map(x => x[0]), th.map(x => x[1]), th.map(x => x[2])]);
    }
    await upsertNames(run, companies.flatMap(c => [{ cik: c.cik, name: c.name, kind: "name", source: "sec_ticker_list" },
      ...c.tickers.map(t => ({ cik: c.cik, name: t, kind: "ticker", source: "sec_ticker_list" }))]));
    // Listed before this snapshot, absent from it: delisted, merged, renamed to another CIK or deregistered.
    const gone = await run(`UPDATE sec_entities SET listed=false,delisted_at=now(),tickers='{}',exchanges='{}'
      WHERE listed AND (listed_seen_at IS NULL OR listed_seen_at<$1) RETURNING cik`, [started]);
    const stats = { companies: companies.length, listings: rows, rejectedRows: rejected, noLongerListed: gone.rowCount || 0 };
    await finishRun(run, id, "success", stats);
    return stats;
  } catch (e) {
    await finishRun(run, id, "error", null, e?.message || e).catch(() => {});
    throw e;
  }
}

/* ---------- 2. issuers and reporting owners from imported filings ---------- */
export async function indexFilingParticipants({ run = queryDb, batch = 2000, maxBatches = 25 } = {}) {
  const id = await startRun(run, "filing-participants");
  const stats = { filings: 0, issuers: 0, owners: 0 };
  try {
    for (let b = 0; b < maxBatches; b++) {
      const cur = (await run("SELECT cursor_at::text AS cursor_at,cursor_key FROM sec_sync_state WHERE job='filing-participants'")).rows[0] || {};
      // updated_at travels as text: a JS Date would drop the microseconds and the last row would be read again.
      const filings = (await run(`SELECT accession,updated_at::text AS cursor_at,issuer_cik,issuer_name,ticker,published_at FROM sec_filings
        WHERE ingest_status='parsed' AND issuer_cik IS NOT NULL AND (updated_at,accession) > ($1::timestamptz,$2::text)
        ORDER BY updated_at,accession LIMIT $3`, [cur.cursor_at || "1970-01-01", cur.cursor_key || "", batch])).rows;
      if (!filings.length) break;
      const accs = filings.map(f => f.accession);
      const owners = (await run(`SELECT accession,owner_cik,owner_name,is_director,is_officer,officer_title,is_ten_percent_owner,other_text
          FROM sec_filing_owners WHERE accession=ANY($1::text[])
        UNION ALL
        SELECT DISTINCT t.accession,t.owner_cik,t.owner_name,NULL::boolean,NULL::boolean,NULL::text,NULL::boolean,NULL::text
          FROM sec_transactions t WHERE t.accession=ANY($1::text[]) AND t.owner_cik IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM sec_filing_owners o WHERE o.accession=t.accession)`, [accs])).rows;
      const byAcc = new Map(filings.map(f => [f.accession, f]));
      const issuers = new Map(), people = new Map(), names = [];
      for (const f of filings) {
        const cik = padCik(f.issuer_cik);
        if (!cik) continue;
        const at = f.published_at ? new Date(f.published_at) : null;
        const e = issuers.get(cik) || { cik, name: f.issuer_name || "", tickers: new Set(), filings: 0, last: null };
        e.filings++;
        if (normalizeTicker(f.ticker)) e.tickers.add(normalizeTicker(f.ticker));
        if (at && (!e.last || at > e.last)) { e.last = at; if (f.issuer_name) e.name = f.issuer_name; }
        issuers.set(cik, e);
        if (f.issuer_name) names.push({ cik, name: f.issuer_name, kind: "filed", source: "form4_issuer" });
      }
      for (const o of owners) {
        const cik = padCik(o.owner_cik), f = byAcc.get(o.accession);
        if (!cik || !f) continue;
        const at = f.published_at ? new Date(f.published_at) : null;
        const e = people.get(cik) || { cik, name: o.owner_name, accs: new Set(), last: null, issuerCik: null, issuerName: null, role: null };
        e.accs.add(o.accession);
        if (!e.last || (at && at > e.last)) { e.last = at; e.name = o.owner_name || e.name; e.issuerCik = padCik(f.issuer_cik); e.issuerName = f.issuer_name; e.role = roleOf(o) || e.role; }
        people.set(cik, e);
        if (o.owner_name) names.push({ cik, name: o.owner_name, kind: "filed", source: "form4_owner" });
      }
      const iv = [...issuers.values()];
      if (iv.length) await run(`INSERT INTO sec_entities(cik,name,kind,kind_basis,is_issuer,issuer_filings,last_filing_at,sources)
        SELECT c,n,'company','form4_issuer',true,k,l,ARRAY['form4'] FROM unnest($1::text[],$2::text[],$3::int[],$4::timestamptz[]) AS x(c,n,k,l)
        ON CONFLICT (cik) DO UPDATE SET is_issuer=true,
          kind=CASE WHEN sec_entities.kind IN ('unknown','person','organization') THEN 'company' ELSE sec_entities.kind END,
          kind_basis=CASE WHEN sec_entities.kind IN ('unknown','person','organization') THEN 'form4_issuer' ELSE sec_entities.kind_basis END,
          issuer_filings=sec_entities.issuer_filings+EXCLUDED.issuer_filings,
          last_filing_at=GREATEST(sec_entities.last_filing_at,EXCLUDED.last_filing_at),
          sources=ARRAY(SELECT DISTINCT unnest(sec_entities.sources||EXCLUDED.sources)),last_seen_at=now()`,
        [iv.map(e => e.cik), iv.map(e => e.name || "CIK " + e.cik), iv.map(e => e.filings), iv.map(e => e.last)]);
      // Tickers as filed: only for issuers that are not on the SEC list (the list's tickers are authoritative).
      const filedTickers = iv.flatMap(e => [...e.tickers].map(t => ({ cik: e.cik, name: t, kind: "ticker", source: "form4_issuer" })));
      if (filedTickers.length) {
        const unlisted = new Set((await run("SELECT cik FROM sec_entities WHERE cik=ANY($1::text[]) AND NOT listed", [[...new Set(filedTickers.map(t => t.cik))]])).rows.map(r => r.cik));
        names.push(...filedTickers.filter(t => unlisted.has(t.cik)));
      }
      const pv = [...people.values()];
      if (pv.length) await run(`INSERT INTO sec_entities(cik,name,kind,kind_basis,is_reporting_owner,owner_filings,last_filing_at,last_issuer_cik,last_issuer_name,last_role,sources)
        SELECT c,n,k,'filed_name_pattern',true,f,l,ic,inm,r,ARRAY['form4']
        FROM unnest($1::text[],$2::text[],$3::text[],$4::int[],$5::timestamptz[],$6::text[],$7::text[],$8::text[]) AS x(c,n,k,f,l,ic,inm,r)
        ON CONFLICT (cik) DO UPDATE SET is_reporting_owner=true,
          kind=CASE WHEN sec_entities.kind='unknown' THEN EXCLUDED.kind ELSE sec_entities.kind END,
          kind_basis=CASE WHEN sec_entities.kind='unknown' THEN EXCLUDED.kind_basis ELSE sec_entities.kind_basis END,
          name=CASE WHEN sec_entities.kind IN ('person','organization','unknown') AND sec_entities.profile_refreshed_at IS NULL THEN EXCLUDED.name ELSE sec_entities.name END,
          owner_filings=sec_entities.owner_filings+EXCLUDED.owner_filings,
          last_filing_at=GREATEST(sec_entities.last_filing_at,EXCLUDED.last_filing_at),
          last_issuer_cik=CASE WHEN EXCLUDED.last_filing_at>=COALESCE(sec_entities.last_filing_at,'-infinity') THEN EXCLUDED.last_issuer_cik ELSE sec_entities.last_issuer_cik END,
          last_issuer_name=CASE WHEN EXCLUDED.last_filing_at>=COALESCE(sec_entities.last_filing_at,'-infinity') THEN EXCLUDED.last_issuer_name ELSE sec_entities.last_issuer_name END,
          last_role=CASE WHEN EXCLUDED.last_filing_at>=COALESCE(sec_entities.last_filing_at,'-infinity') THEN COALESCE(EXCLUDED.last_role,sec_entities.last_role) ELSE sec_entities.last_role END,
          sources=ARRAY(SELECT DISTINCT unnest(sec_entities.sources||EXCLUDED.sources)),last_seen_at=now()`,
        [pv.map(e => e.cik), pv.map(e => e.name || "CIK " + e.cik), pv.map(e => classifyOwnerName(e.name)), pv.map(e => e.accs.size),
          pv.map(e => e.last), pv.map(e => e.issuerCik), pv.map(e => e.issuerName), pv.map(e => e.role)]);
      await upsertNames(run, names);
      const last = filings[filings.length - 1];
      await run(`INSERT INTO sec_sync_state(job,cursor_at,cursor_key) VALUES('filing-participants',$1,$2)
        ON CONFLICT (job) DO UPDATE SET cursor_at=EXCLUDED.cursor_at,cursor_key=EXCLUDED.cursor_key,updated_at=now()`, [last.cursor_at, last.accession]);
      stats.filings += filings.length; stats.issuers += iv.length; stats.owners += pv.length;
      if (filings.length < batch) break;
    }
    await finishRun(run, id, "success", stats);
    return stats;
  } catch (e) {
    await finishRun(run, id, "error", stats, e?.message || e).catch(() => {});
    throw e;
  }
}
/* A re-imported filing (amendment, retry) is counted again by the incremental pass above; this recount makes the
 * per-entity filing counts exact. Cheap enough to run after each daily directory sync. */
export async function recountParticipation(run = queryDb) {
  await run(`UPDATE sec_entities e SET issuer_filings=c.n FROM (SELECT LPAD(LTRIM(issuer_cik,'0'),10,'0') AS cik,count(*)::int AS n
    FROM sec_filings WHERE ingest_status='parsed' AND issuer_cik ~ '^[0-9]+$' GROUP BY 1) c WHERE e.cik=c.cik AND e.issuer_filings<>c.n`);
  await run(`UPDATE sec_entities e SET owner_filings=c.n FROM (SELECT LPAD(LTRIM(owner_cik,'0'),10,'0') AS cik,count(DISTINCT accession)::int AS n FROM (
      SELECT owner_cik,accession FROM sec_filing_owners UNION ALL SELECT owner_cik,accession FROM sec_transactions WHERE owner_cik IS NOT NULL) x
    WHERE owner_cik ~ '^[0-9]+$' GROUP BY 1) c WHERE e.cik=c.cik AND e.owner_filings<>c.n`);
}

/* ---------- 3. one CIK's EDGAR submissions, on demand ---------- */
export const submissionsUrl = cik => "https://data.sec.gov/submissions/CIK" + cik + ".json";
export function profileFromSubmissions(data, cik) {
  if (!data || padCik(data.cik) !== cik) return null;
  const tickers = (Array.isArray(data.tickers) ? data.tickers : []).map(normalizeTicker).filter(Boolean);
  const exchanges = (Array.isArray(data.exchanges) ? data.exchanges : []).map(x => String(x ?? "").slice(0, 40));
  const name = String(data.name ?? "").trim().slice(0, 200);
  const sic = /^\d{3,4}$/.test(String(data.sic ?? "")) ? String(data.sic) : null;
  const entityType = String(data.entityType ?? "").trim().slice(0, 40) || null;
  const ownerFlag = Number(data.insiderTransactionForOwnerExists) === 1, issuerFlag = Number(data.insiderTransactionForIssuerExists) === 1;
  const kind = tickers.length || sic || entityType === "operating" || issuerFlag ? "company"
    : ownerFlag ? classifyOwnerName(name) : "unknown";
  const basis = kind === "company" ? "edgar_submissions" : ownerFlag ? "filed_name_pattern" : "edgar_submissions";
  const former = (Array.isArray(data.formerNames) ? data.formerNames : []).map(f => ({
    name: String(f?.name ?? "").trim().slice(0, 200), from: String(f?.from ?? "").slice(0, 10) || null, to: String(f?.to ?? "").slice(0, 10) || null
  })).filter(f => f.name);
  const recent = data.filings?.recent || {};
  const filings = [];
  for (let i = 0; i < Math.min(40, recent.form?.length || 0); i++) {
    const acc = String(recent.accessionNumber?.[i] ?? "");
    if (!/^\d{10}-\d{2}-\d{6}$/.test(acc)) continue;
    filings.push({ form: String(recent.form[i] ?? "").slice(0, 20), filedAt: String(recent.filingDate?.[i] ?? "").slice(0, 10) || null,
      reportDate: String(recent.reportDate?.[i] ?? "").slice(0, 10) || null, accession: acc,
      url: "https://www.sec.gov/Archives/edgar/data/" + Number(cik) + "/" + acc.replace(/-/g, "") + "/" + acc + "-index.htm" });
  }
  return { cik, name, kind, kindBasis: basis, tickers, exchanges, sic, sicDescription: String(data.sicDescription ?? "").slice(0, 120) || null,
    entityType, stateOfIncorporation: String(data.stateOfIncorporation ?? "").slice(0, 10) || null, isReportingOwner: ownerFlag,
    isIssuer: issuerFlag || tickers.length > 0, formerNames: former, recentFilings: filings,
    olderFilingFiles: Array.isArray(data.filings?.files) ? data.filings.files.length : 0 };
}

const submissionsCache = createCache(500);
export async function resolveEntity(cikInput, { run = queryDb, fetcher = secFetch, maxAgeMs = 7 * 86400_000 } = {}) {
  const cik = padCik(cikInput);
  if (!cik) return { state: "invalid" };
  let data;
  try {
    data = await (fetcher === secFetch ? submissionsCache("subs:" + cik, 30 * 60_000, () => fetcher(submissionsUrl(cik), { json: true })) : fetcher(submissionsUrl(cik), { json: true }));
  } catch (e) {
    // EDGAR answers 404 for a CIK it has never assigned: that, and only that, is "no such filer".
    if (/SEC responded 404/.test(String(e?.message))) return { state: "not_found", cik };
    return { state: "source_unavailable", cik, error: String(e?.message || e).slice(0, 160) };
  }
  const p = profileFromSubmissions(data, cik);
  if (!p) return { state: "not_found", cik };
  await run(`INSERT INTO sec_entities(cik,name,kind,kind_basis,is_issuer,is_reporting_owner,tickers,exchanges,sic,sic_description,entity_type,state_of_incorporation,sources,profile_refreshed_at,profile_error)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,ARRAY['edgar_submissions'],now(),NULL)
    ON CONFLICT (cik) DO UPDATE SET name=EXCLUDED.name,
      kind=CASE WHEN sec_entities.kind='company' OR EXCLUDED.kind='company' THEN 'company' WHEN sec_entities.kind='unknown' THEN EXCLUDED.kind ELSE sec_entities.kind END,
      kind_basis=CASE WHEN EXCLUDED.kind='company' AND sec_entities.kind<>'company' THEN EXCLUDED.kind_basis WHEN sec_entities.kind='unknown' THEN EXCLUDED.kind_basis ELSE sec_entities.kind_basis END,
      is_issuer=sec_entities.is_issuer OR EXCLUDED.is_issuer,is_reporting_owner=sec_entities.is_reporting_owner OR EXCLUDED.is_reporting_owner,
      tickers=CASE WHEN sec_entities.listed THEN sec_entities.tickers ELSE EXCLUDED.tickers END,
      exchanges=CASE WHEN sec_entities.listed THEN sec_entities.exchanges ELSE EXCLUDED.exchanges END,
      sic=EXCLUDED.sic,sic_description=EXCLUDED.sic_description,entity_type=EXCLUDED.entity_type,state_of_incorporation=EXCLUDED.state_of_incorporation,
      sources=ARRAY(SELECT DISTINCT unnest(sec_entities.sources||EXCLUDED.sources)),profile_refreshed_at=now(),profile_error=NULL,last_seen_at=now()`,
    [cik, p.name || "CIK " + cik, p.kind, p.kindBasis, p.isIssuer, p.isReportingOwner, p.tickers, p.exchanges, p.sic, p.sicDescription, p.entityType, p.stateOfIncorporation]);
  await upsertNames(run, [{ cik, name: p.name, kind: "name", source: "edgar_submissions" },
    ...p.formerNames.map(f => ({ cik, name: f.name, kind: "former", source: "edgar_submissions" })),
    ...p.tickers.map(t => ({ cik, name: t, kind: "ticker", source: "edgar_submissions" }))]);
  for (const f of p.formerNames) await run("UPDATE sec_entity_names SET valid_from=$3::date,valid_to=$4::date WHERE cik=$1 AND norm=$2 AND name_kind='former'",
    [cik, normalizeName(f.name), /^\d{4}-\d{2}-\d{2}$/.test(f.from || "") ? f.from : null, /^\d{4}-\d{2}-\d{2}$/.test(f.to || "") ? f.to : null]);
  if (p.tickers.length) await run(`INSERT INTO sec_ticker_history(cik,ticker,exchange) SELECT $1,t,e FROM unnest($2::text[],$3::text[]) AS x(t,e)
    ON CONFLICT (cik,ticker) DO UPDATE SET last_seen_at=now()`, [cik, p.tickers, p.tickers.map((_, i) => p.exchanges[i] || null)]);
  return { state: "ok", cik, profile: p };
}

/* ---------- 4. EDGAR's entity name lookup, on demand ---------- */
const edgarCache = createCache(400);
export function parseEntityHits(data) {
  const hits = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];
  return hits.map(h => {
    const cik = padCik(h?._id);
    // "BERKSHIRE HATHAWAY INC (BRK-B, BRK-A)": the parenthesised tickers are not part of the name.
    const raw = String(h?._source?.entity ?? "").trim();
    const name = raw.replace(/\s*\((?:[A-Z0-9.-]{1,10})(?:,\s*[A-Z0-9.-]{1,10})*\)\s*$/, "").replace(/\s*\(CIK \d+\)\s*$/i, "").trim().slice(0, 200);
    const tickers = (Array.isArray(h?._source?.tickers) ? h._source.tickers : String(h?._source?.tickers ?? "").split(/[,\s]+/)).map(normalizeTicker).filter(Boolean);
    return cik && name ? { cik, name, tickers } : null;
  }).filter(Boolean);
}
export async function edgarEntityLookup(q, { run = queryDb, fetcher = secFetch } = {}) {
  const text = String(q ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (text.length < 3) return { state: "skipped", hits: [] };
  const url = "https://efts.sec.gov/LATEST/search-index?keysTyped=" + encodeURIComponent(text);
  let hits;
  try {
    hits = parseEntityHits(await (fetcher === secFetch ? edgarCache("efts:" + text.toUpperCase(), 60 * 60_000, () => fetcher(url, { json: true })) : fetcher(url, { json: true })));
  } catch (e) { return { state: "source_unavailable", hits: [], error: String(e?.message || e).slice(0, 160) }; }
  if (hits.length) {
    await run(`INSERT INTO sec_entities(cik,name,kind,kind_basis,sources) SELECT c,n,'unknown','edgar_entity_lookup',ARRAY['edgar_entity_lookup']
      FROM unnest($1::text[],$2::text[]) AS x(c,n) ON CONFLICT (cik) DO UPDATE SET sources=ARRAY(SELECT DISTINCT unnest(sec_entities.sources||EXCLUDED.sources)),last_seen_at=now()`,
      [hits.map(h => h.cik), hits.map(h => h.name)]);
    await upsertNames(run, hits.flatMap(h => [{ cik: h.cik, name: h.name, kind: "name", source: "edgar_entity_lookup" }]));
  }
  return { state: "ok", hits };
}

/* ---------- search ---------- */
let trgm = null;
export async function hasTrigram(run = queryDb) {
  // Installed AND reachable on this connection's search_path (similarity() and the % operator are unqualified below).
  if (trgm === null) trgm = await run("SELECT similarity('a','a') AS s").then(() => true, () => false);
  return trgm;
}
export const KINDS = new Set(["company", "person", "organization", "owner", "all"]);
const kindFilter = kind => kind === "company" ? "e.kind='company'" : kind === "person" ? "e.kind='person'" : kind === "organization" ? "e.kind='organization'"
  : kind === "owner" ? "(e.is_reporting_owner OR e.kind IN ('person','organization'))" : "TRUE";

/* Local search over every stored name and ticker. Each word must start a word of the name (any order); a ticker or
 * CIK matches exactly or by prefix; with pg_trgm, names one or two letters off still match (scored lower).
 * total counts every match (to 10,000), so a page of results never stands for the whole result set. */
export async function searchLocal(qInput, { run = queryDb, kind = "all", limit = 20, offset = 0 } = {}) {
  const q = normalizeName(qInput).slice(0, 80);
  if (!q) return { items: [], total: 0 };
  const words = q.split(" ").filter(Boolean).slice(0, 6);
  const digits = /^\d{1,10}$/.test(q.replace(/ /g, "")) ? q.replace(/ /g, "").replace(/^0+/, "") : null;
  const params = [q, limit, offset];
  const wordConds = words.map(w => { params.push(w); return `(' '||n.norm) LIKE '% '||$${params.length}||'%'`; }).join(" AND ");
  const fuzzy = (await hasTrigram(run)) && q.length >= 4 && !digits;
  params.push(digits ? digits.padStart(10, "0") : null);
  const cikParam = "$" + params.length;
  const sql = `WITH m AS (
      SELECT n.cik, n.name, n.name_kind,
        CASE WHEN ${cikParam}::text IS NOT NULL AND n.cik=${cikParam} THEN 1000
             WHEN n.name_kind='ticker' AND n.norm=$1 THEN 950
             WHEN n.norm=$1 THEN 900
             WHEN n.name_kind='ticker' AND n.norm LIKE $1||'%' THEN 800-length(n.norm)
             WHEN n.norm LIKE $1||'%' THEN 700
             WHEN ${wordConds} THEN 600
             ${fuzzy ? "ELSE 300+(similarity(n.norm,$1)*100)::int" : "ELSE 0"} END AS score
      FROM sec_entity_names n
      WHERE (${cikParam}::text IS NOT NULL AND n.cik=${cikParam}) OR n.norm LIKE $1||'%' OR (${wordConds})${fuzzy ? " OR n.norm % $1" : ""}
    ), best AS (
      SELECT DISTINCT ON (m.cik) m.cik, m.name AS matched, m.name_kind, m.score FROM m WHERE m.score>0 ORDER BY m.cik, m.score DESC, m.name_kind
    ), ranked AS (
      SELECT b.*, e.name, e.kind, e.kind_basis, e.tickers, e.exchanges, e.listed, e.is_issuer, e.is_reporting_owner, e.issuer_filings, e.owner_filings,
        e.last_filing_at, e.last_issuer_cik, e.last_issuer_name, e.last_role, e.delisted_at, e.sources,
        count(*) OVER () AS total, count(*) FILTER (WHERE b.score>=600) OVER () AS strong
      FROM best b JOIN sec_entities e ON e.cik=b.cik WHERE ${kindFilter(kind)}
    )
    SELECT * FROM ranked ORDER BY score DESC, listed DESC, (issuer_filings+owner_filings) DESC, length(matched), name LIMIT $2 OFFSET $3`;
  const rows = (await run(sql, params)).rows;
  // strong: matches by CIK, ticker, whole name or every word; typo-tolerant matches are counted in total only.
  return { items: rows.map(itemOf), total: rows.length ? Math.min(10000, Number(rows[0].total)) : (offset ? null : 0), strong: rows.length ? Number(rows[0].strong) : 0 };
}
function itemOf(r) {
  const matchedOther = r.name_kind !== "ticker" && normalizeName(r.matched) !== normalizeName(r.name);
  return {
    cik: r.cik, name: r.name, displayName: r.kind === "person" ? readableName(r.name) : null, kind: r.kind, kindBasis: r.kind_basis, tickers: r.tickers || [], exchanges: r.exchanges || [], listed: !!r.listed,
    isIssuer: !!r.is_issuer, isReportingOwner: !!r.is_reporting_owner, importedFilings: { asIssuer: r.issuer_filings || 0, asOwner: r.owner_filings || 0 },
    lastFilingAt: r.last_filing_at ? new Date(r.last_filing_at).toISOString() : null,
    latestRole: r.last_role ? { role: r.last_role, issuerCik: r.last_issuer_cik, issuerName: r.last_issuer_name } : null,
    delistedAt: r.delisted_at ? new Date(r.delisted_at).toISOString() : null,
    matched: matchedOther ? { name: r.matched, as: r.name_kind === "former" ? "former name" : r.name_kind === "filed" ? "name as filed" : "name" } : null,
    sources: r.sources || [], url: entityUrl(r)
  };
}
export function entityUrl(r) {
  const tickers = r.tickers || [];
  if (r.kind === "company" && r.listed && tickers[0]) return "company.html?ticker=" + encodeURIComponent(tickers[0]);
  if ((r.kind === "person" || r.kind === "organization") && (r.is_reporting_owner ?? r.isReportingOwner)) return "person.html?cik=" + r.cik;
  return "entity.html?cik=" + r.cik;
}

/* Search with on-demand lookup: a CIK that is not stored is resolved from EDGAR submissions, and a name that
 * finds fewer than `lookupBelow` stored entities is looked up in EDGAR's entity index, whose hits are stored and
 * searched again. state says why a list is empty: no_match (looked everywhere it could) or source_unavailable. */
/* Titles the SEC rarely files names with ("Sheikh Tahnoon" is filed as "Al-Nahyan Tahnoon Bin Zayed S."), and common
 * spellings of one name. A search with no exact match is tried again without the titles, then with the other spellings,
 * and says which wording found the results. */
const TITLES = /\b(his|her)\s+(royal\s+)?(highness|excellency)\b|\bh\s?r\s?h\b|\b(prince|princess|king|queen|sheikh|shaikh|sheik|sheikha|emir|amir|sultan|crown|president|senator|sen|representative|rep|congressman|congresswoman|governor|gov|mr|mrs|ms|dr|sir|lord|lady|dame|hon|honorable|the)\b/gi;
const SPELLINGS = [["MOHAMMED", "MOHAMMAD", "MUHAMMAD", "MOHAMED", "MOHAMAD", "MUHAMMED"], ["ABDULLAH", "ABDALLAH"], ["ABDULAZIZ", "ABDUL AZIZ", "ABDELAZIZ"],
  ["KHALID", "KHALED"], ["HAMAD", "HAMED"], ["YOUSEF", "YOUSSEF", "YUSUF", "YOUSUF"], ["AHMED", "AHMAD"], ["HUSSEIN", "HUSSAIN", "HUSAIN"], ["ALWALEED", "AL WALEED"]];
export function searchVariants(q) {
  const out = [], norm = normalizeName(q), add = v => { v = normalizeName(v); if (v && v.length >= 3 && v !== norm && !out.includes(v)) out.push(v); };
  const bare = normalizeName(String(q ?? "").replace(TITLES, " "));
  add(bare);
  for (const base of [bare || norm]) for (const group of SPELLINGS) for (const w of group) if ((" " + base + " ").includes(" " + w + " "))
    for (const alt of group) if (alt !== w) add((" " + base + " ").replace(" " + w + " ", " " + alt + " "));
  return out.slice(0, 4);
}

export async function searchEntities(q, { run = queryDb, fetcher = secFetch, kind = "all", limit = 20, offset = 0, lookupBelow = 5, edgar = true } = {}) {
  const first = await searchOnce(q, { run, fetcher, kind, limit, offset, lookupBelow, edgar });
  if (first.strong || offset || first.state === "source_unavailable") return first;
  for (const v of searchVariants(q)) {
    const r = await searchOnce(v, { run, fetcher, kind, limit, offset, lookupBelow, edgar });
    if (r.strong) return { ...r, searchedAs: v.toLowerCase(), lookups: [...first.lookups, ...r.lookups] };
  }
  return first;
}
async function searchOnce(q, { run, fetcher, kind, limit, offset, lookupBelow, edgar }) {
  let local = await searchLocal(q, { run, kind, limit, offset });
  const lookups = [];
  const norm = normalizeName(q), digits = /^\d{1,10}$/.test(norm.replace(/ /g, "")) ? norm.replace(/ /g, "") : null;
  if (edgar && !offset && digits && !local.items.some(i => Number(i.cik) === Number(digits))) {
    const r = await resolveEntity(digits, { run, fetcher });
    lookups.push({ source: "edgar_submissions", state: r.state });
    if (r.state === "ok") local = await searchLocal(q, { run, kind, limit, offset });
  } else if (edgar && !offset && !digits && norm.length >= 3 && local.strong < lookupBelow) {
    const r = await edgarEntityLookup(q, { run, fetcher });
    lookups.push({ source: "edgar_entity_lookup", state: r.state, hits: r.hits.length });
    // An EDGAR hit only says a name and a CIK exist; read its submissions so it has a kind (bounded, ranked first).
    for (const h of r.hits.slice(0, 3)) {
      const known = (await run("SELECT kind,profile_refreshed_at FROM sec_entities WHERE cik=$1", [h.cik])).rows[0];
      if (known && known.kind === "unknown" && !known.profile_refreshed_at) await resolveEntity(h.cik, { run, fetcher }).catch(() => null);
    }
    if (r.hits.length) local = await searchLocal(q, { run, kind, limit, offset });
  }
  const unavailable = lookups.some(l => l.state === "source_unavailable");
  const state = local.items.length ? "ok" : unavailable ? "source_unavailable" : "no_match";
  return { ...local, offset, limit, hasMore: local.total != null && offset + local.items.length < local.total, state, lookups, exact: local.strong > 0 };
}

/* One entity with everything stored about it (names, tickers, imported participation). */
export async function entityRecord(cikInput, { run = queryDb, fetcher = secFetch, refresh = true } = {}) {
  const cik = padCik(cikInput);
  if (!cik) return { state: "invalid" };
  let row = (await run("SELECT * FROM sec_entities WHERE cik=$1", [cik])).rows[0];
  let live = null;
  const stale = !row?.profile_refreshed_at || Date.now() - new Date(row.profile_refreshed_at).getTime() > 7 * 86400_000;
  if (refresh && (stale || !row)) {
    live = await resolveEntity(cik, { run, fetcher });
    if (live.state === "not_found" && !row) return { state: "not_found", cik };
    row = (await run("SELECT * FROM sec_entities WHERE cik=$1", [cik])).rows[0] || row;
  } else if (refresh) {
    live = await resolveEntity(cik, { run, fetcher }).catch(() => null);
  }
  if (!row) return { state: live?.state || "source_unavailable", cik };
  const [names, tickers, asIssuer, asOwner] = await Promise.all([
    run("SELECT name,name_kind,source,valid_from,valid_to FROM sec_entity_names WHERE cik=$1 ORDER BY name_kind,last_seen_at DESC LIMIT 60", [cik]),
    run("SELECT ticker,exchange,first_seen_at,last_seen_at FROM sec_ticker_history WHERE cik=$1 ORDER BY last_seen_at DESC", [cik]),
    run(`SELECT count(*)::int AS filings,max(published_at) AS last FROM sec_filings WHERE ingest_status='parsed' AND LTRIM(issuer_cik,'0')=LTRIM($1,'0')`, [cik]),
    run(`SELECT LPAD(LTRIM(f.issuer_cik,'0'),10,'0') AS issuer_cik,(array_agg(f.issuer_name ORDER BY f.published_at DESC NULLS LAST))[1] AS issuer_name,
        (array_agg(f.ticker ORDER BY f.published_at DESC NULLS LAST))[1] AS ticker,count(DISTINCT f.accession)::int AS filings,max(f.published_at) AS last,
        bool_or(o.is_director) AS director,bool_or(o.is_officer) AS officer,bool_or(o.is_ten_percent_owner) AS ten_percent,
        (array_agg(o.officer_title ORDER BY f.published_at DESC NULLS LAST) FILTER (WHERE o.officer_title IS NOT NULL))[1] AS officer_title,
        (array_agg(f.source_url ORDER BY f.published_at DESC NULLS LAST))[1] AS evidence_url
      FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession
      WHERE LTRIM(o.owner_cik,'0')=LTRIM($1,'0') GROUP BY 1 ORDER BY max(f.published_at) DESC NULLS LAST LIMIT 50`, [cik])
  ]);
  const p = live?.state === "ok" ? live.profile : null;
  return {
    state: "ok",
    entity: { ...itemOf({ ...row, matched: row.name, name_kind: "name" }), sic: row.sic, sicDescription: row.sic_description, entityType: row.entity_type,
      stateOfIncorporation: row.state_of_incorporation, profileRefreshedAt: row.profile_refreshed_at ? new Date(row.profile_refreshed_at).toISOString() : null },
    names: names.rows.map(n => ({ name: n.name, as: n.name_kind, source: n.source, from: n.valid_from ? new Date(n.valid_from).toISOString().slice(0, 10) : null, to: n.valid_to ? new Date(n.valid_to).toISOString().slice(0, 10) : null })),
    tickerHistory: tickers.rows.map(t => ({ ticker: t.ticker, exchange: t.exchange, firstSeenAt: new Date(t.first_seen_at).toISOString(), lastSeenAt: new Date(t.last_seen_at).toISOString() })),
    imported: {
      asIssuer: { filings: asIssuer.rows[0]?.filings || 0, lastFiledAt: asIssuer.rows[0]?.last ? new Date(asIssuer.rows[0].last).toISOString() : null },
      asReportingOwner: asOwner.rows.map(r => ({ issuerCik: r.issuer_cik, issuerName: r.issuer_name, ticker: r.ticker, filings: r.filings,
        lastFiledAt: r.last ? new Date(r.last).toISOString() : null, role: roleOf({ is_director: r.director, is_officer: r.officer, officer_title: r.officer_title, is_ten_percent_owner: r.ten_percent }),
        evidenceUrl: r.evidence_url }))
    },
    edgar: p ? { recentFilings: p.recentFilings, olderFilingFiles: p.olderFilingFiles, sourceUrl: submissionsUrl(cik),
      browseUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + cik + "&owner=include&count=40" } : null,
    edgarState: live?.state || "cached"
  };
}

/* EDGAR submissions for every company and reporting owner in the directory, a bounded batch per run: former names,
 * SIC code, state, entity type and the ownership-filer flag. Never-read entities first (listed companies, then
 * issuers and owners with imported filings), then the oldest reads, so the whole directory is re-read monthly. Yields
 * when people are waiting on the shared SEC throttle; a failed read is recorded on the row and retried next cycle. */
export async function refreshProfiles({ run = queryDb, fetcher = secFetch, budget = 200, maxAgeDays = 30, backlog = () => 0, maxBacklogMs = 2500, deadlineMs = 4 * 60_000 } = {}) {
  const id = await startRun(run, "entity-profiles");
  const stats = { read: 0, failed: 0, notFound: 0, yielded: false, remaining: 0 };
  const until = Date.now() + deadlineMs;
  try {
    const due = (await run(`SELECT cik FROM sec_entities WHERE (kind<>'unknown' OR 'edgar_entity_lookup'=ANY(sources))
        AND (profile_refreshed_at IS NULL OR profile_refreshed_at<now()-make_interval(days=>$2))
      ORDER BY profile_refreshed_at NULLS FIRST, listed DESC, (issuer_filings+owner_filings) DESC, cik LIMIT $1`, [budget, maxAgeDays])).rows;
    for (const { cik } of due) {
      if (Date.now() > until || backlog() > maxBacklogMs) { stats.yielded = backlog() > maxBacklogMs; break; }
      const r = await resolveEntity(cik, { run, fetcher });
      if (r.state === "ok") stats.read++;
      else {
        if (r.state === "not_found") stats.notFound++; else stats.failed++;
        await run("UPDATE sec_entities SET profile_error=$2,profile_refreshed_at=CASE WHEN $3 THEN now() ELSE profile_refreshed_at END WHERE cik=$1",
          [cik, r.state + (r.error ? ": " + r.error : ""), r.state === "not_found"]);
        if (/403/.test(r.error || "")) break;
      }
    }
    stats.remaining = (await run(`SELECT count(*)::int AS n FROM sec_entities WHERE kind<>'unknown' AND (profile_refreshed_at IS NULL OR profile_refreshed_at<now()-make_interval(days=>$1))`, [maxAgeDays])).rows[0].n;
    await finishRun(run, id, stats.failed ? "partial" : "success", stats);
    return stats;
  } catch (e) {
    await finishRun(run, id, "error", stats, e?.message || e).catch(() => {});
    throw e;
  }
}
