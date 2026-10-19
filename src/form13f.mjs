/* Form 13F institutional holdings for Intelligence Mirror.
 *
 * What a 13F is, and is not: a quarterly report by an institutional investment manager (over $100M in
 * 13(f) securities) of certain long positions in US exchange-listed equities, some options and
 * convertibles, as of the last day of a calendar quarter, filed up to 45 days later. It is not a trade
 * feed, it omits short positions, cash, most non-US holdings and anything granted confidential
 * treatment, and it says nothing about what the manager did after quarter end. Everything below keeps
 * those limits visible.
 *
 * Ingestion reads only SEC EDGAR (through the shared secFetch: User-Agent, allowlist, throttle):
 *   data.sec.gov/submissions/CIK##########.json        -> the manager's name and its 13F-HR filings
 *   www.sec.gov/Archives/edgar/data/<cik>/<acc>/index.json -> the filing's documents
 *   primary_doc.xml                                    -> cover page and summary page totals
 *   the information table XML                          -> one row per holding
 * Each filing is stored once (accession primary key) with a content hash; parsed row count and value are
 * compared with the summary page's tableEntryTotal / tableValueTotal and the result is stored as
 * completeness. Values are normalised to dollars: filings made before 2023-01-03 reported thousands. */
import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { query as queryDb, requireDb } from "./db.mjs";
import { secFetch } from "./sec.mjs";
import { secReady } from "./config.mjs";

const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true, processEntities: true });
const list = v => v == null ? [] : Array.isArray(v) ? v : [v];
const text = v => v == null ? null : typeof v === "object" ? text(v["#text"]) : String(v).trim() || null;
const number = v => { const s = text(v); if (s == null) return null; const c = s.replace(/,/g, ""); if (!/^-?\d+(\.\d+)?$/.test(c)) return null; const n = Number(c); return Number.isFinite(n) ? n : null; };
const mdy = v => { const s = text(v); let m; if (s && (m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s))) return m[3] + "-" + m[1] + "-" + m[2]; return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const fail = (status, message) => Object.assign(new Error(message), { status });
export const cik10 = c => { const b = String(c ?? "").trim().replace(/^0+/, ""); return /^\d{1,10}$/.test(b) ? b.padStart(10, "0") : null; };

/* SEC changed 13F value reporting from thousands to whole dollars for filings made on or after 3 January 2023. */
export const DOLLAR_VALUES_FROM = "2023-01-03";
export const valueUnitFor = filedAt => String(filedAt) >= DOLLAR_VALUES_FROM ? "dollars" : "thousands";

export function parsePrimaryDoc(body) {
  let root;
  try { root = xml.parse(String(body || ""))?.edgarSubmission; } catch { root = null; }
  if (!root) throw new Error("Not a 13F primary document");
  const cover = root.formData?.coverPage || {}, summary = root.formData?.summaryPage || {};
  return {
    periodOfReport: mdy(root.headerData?.filerInfo?.periodOfReport) || mdy(cover.reportCalendarOrQuarter),
    reportType: text(cover.reportType),
    isAmendment: /^(true|y|1)$/i.test(text(cover.isAmendment) || ""),
    amendmentType: text(cover.amendmentInfo?.amendmentType),
    managerName: text(cover.filingManager?.name),
    tableEntryTotal: number(summary.tableEntryTotal),
    tableValueTotal: number(summary.tableValueTotal),
    otherIncludedManagersCount: number(summary.otherIncludedManagersCount) || 0,
    isConfidentialOmitted: /^(true|y|1)$/i.test(text(summary.isConfidentialOmitted) || "")
  };
}

export function parseInfoTable(body) {
  let root;
  try { root = xml.parse(String(body || ""))?.informationTable; } catch { root = null; }
  if (!root) throw new Error("Not a 13F information table");
  const rows = [];
  for (const r of list(root.infoTable)) {
    const cusip = (text(r.cusip) || "").toUpperCase();
    const value = number(r.value);
    if (!/^[0-9A-Z]{9}$/.test(cusip) || value == null) continue;
    rows.push({
      issuerName: (text(r.nameOfIssuer) || "Unnamed issuer").slice(0, 200), titleOfClass: (text(r.titleOfClass) || "").slice(0, 100) || null, cusip, value,
      shares: number(r.shrsOrPrnAmt?.sshPrnamt), shareType: (text(r.shrsOrPrnAmt?.sshPrnamtType) || "").toUpperCase() || null,
      putCall: (text(r.putCall) || "").toUpperCase() || null, investmentDiscretion: (text(r.investmentDiscretion) || "").toUpperCase() || null
    });
  }
  return { rows, declared: list(root.infoTable).length };
}

/* Compare what was parsed with the cover page's own totals. */
export function completenessOf(cover, rows) {
  const parsedValue = rows.reduce((s, r) => s + r.value, 0);
  if (cover.tableEntryTotal == null || cover.tableValueTotal == null) return { completeness: "totals_missing", parsedValue };
  const entriesMatch = cover.tableEntryTotal === rows.length;
  const tolerance = Math.max(rows.length, Math.abs(cover.tableValueTotal) * 0.001);
  const valueMatch = Math.abs(cover.tableValueTotal - parsedValue) <= tolerance;
  return { completeness: entriesMatch && valueMatch ? "complete" : "totals_mismatch", parsedValue, entriesMatch, valueMatch };
}

/* The 13F-HR filings listed in a manager's EDGAR submissions, newest first. */
export function thirteenFFilings(submissions, limit = 8) {
  const r = submissions?.filings?.recent;
  if (!r || !Array.isArray(r.form)) return [];
  const out = [];
  for (let i = 0; i < Math.min(r.form.length, 4000) && out.length < limit; i++) {
    const form = String(r.form[i] || "");
    if (form !== "13F-HR" && form !== "13F-HR/A") continue;
    const acc = String(r.accessionNumber?.[i] || ""), filed = String(r.filingDate?.[i] || ""), period = String(r.reportDate?.[i] || "");
    if (!/^\d{10}-\d{2}-\d{6}$/.test(acc) || !/^\d{4}-\d{2}-\d{2}$/.test(filed)) continue;
    out.push({ form, accession: acc.replace(/-/g, ""), accessionDashed: acc, filedAt: filed, periodOfReport: /^\d{4}-\d{2}-\d{2}$/.test(period) ? period : null });
  }
  return out;
}

const docBase = (cik, acc) => "https://www.sec.gov/Archives/edgar/data/" + String(Number(cik)) + "/" + acc + "/";
export function pickDocuments(index) {
  const items = list(index?.directory?.item).map(x => String(x?.name || "")).filter(n => /^[A-Za-z0-9_.-]{1,120}\.xml$/i.test(n));
  const primary = items.find(n => /^primary_doc\.xml$/i.test(n)) || null;
  const tables = items.filter(n => n !== primary).sort((a, b) => (/info/i.test(b) ? 1 : 0) - (/info/i.test(a) ? 1 : 0)).slice(0, 4);
  return { primary, tables };
}

export async function fetchFiling(cik, f, fetcher = secFetch) {
  const base = docBase(cik, f.accession);
  const docs = pickDocuments(await fetcher(base + "index.json", { json: true }));
  if (!docs.primary) throw new Error("No primary_doc.xml in " + f.accessionDashed);
  const cover = parsePrimaryDoc(await fetcher(base + docs.primary));
  if (/NOTICE/i.test(cover.reportType || "")) return { notice: true, cover };
  for (const name of docs.tables) {
    const body = await fetcher(base + name);
    if (!/informationTable/.test(body)) continue;
    const table = parseInfoTable(body);
    return { cover, table, infoTableUrl: base + name, sourceUrl: base + f.accessionDashed + "-index.htm", contentHash: createHash("sha256").update(body).digest("hex") };
  }
  throw new Error("No information table in " + f.accessionDashed);
}

async function storeFiling(cik, f, got, connect = () => requireDb().connect()) {
  const unit = valueUnitFor(f.filedAt), scale = unit === "thousands" ? 1000 : 1;
  const check = completenessOf(got.cover, got.table.rows);
  const period = got.cover.periodOfReport || f.periodOfReport;
  if (!period) throw new Error("No period of report for " + f.accessionDashed);
  const client = await connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(`INSERT INTO form13f_filings(accession,manager_cik,form_type,amendment_type,period_of_report,filed_at,source_url,info_table_url,
      table_entry_total,table_value_total,parsed_entries,parsed_value_total,value_unit,confidential_omitted,other_managers_included,completeness,content_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT(accession) DO NOTHING RETURNING accession`,
      [f.accession, cik, f.form, got.cover.amendmentType, period, f.filedAt, got.sourceUrl, got.infoTableUrl,
        got.cover.tableEntryTotal, got.cover.tableValueTotal == null ? null : got.cover.tableValueTotal * scale, got.table.rows.length, check.parsedValue * scale,
        unit, got.cover.isConfidentialOmitted, got.cover.otherIncludedManagersCount > 0, check.completeness, got.contentHash]);
    if (inserted.rowCount) {
      const rows = got.table.rows;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500), params = [], values = [];
        chunk.forEach((r, j) => {
          const b = params.length;
          values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`);
          params.push(f.accession, i + j + 1, r.issuerName, r.titleOfClass, r.cusip, r.value * scale, r.shares, r.shareType, r.putCall, r.investmentDiscretion);
        });
        await client.query(`INSERT INTO form13f_holdings(accession,row_no,issuer_name,title_of_class,cusip,value_usd,shares_or_principal,share_type,put_call,investment_discretion) VALUES ${values.join(",")}`, params);
      }
    }
    await client.query("COMMIT");
    return inserted.rowCount > 0;
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
  finally { client.release(); }
}

/* Managers to track. Only CIKs are configured: the name shown is always the one EDGAR returns, and a CIK
 * that files no 13F-HR is recorded as such and never shown. Defaults are large, widely followed filers
 * whose information tables are a manageable size. */
export const DEFAULT_MANAGER_CIKS = Object.freeze(["0001067983", "0001336528", "0001649339", "0001061768", "0001350694", "0001656456"]);
export function managerCiks(env = process.env) {
  const raw = String(env.INSIDIR_13F_MANAGER_CIKS || "").trim();
  const ciks = (raw ? raw.split(/[,\s]+/) : DEFAULT_MANAGER_CIKS).map(cik10).filter(Boolean);
  return [...new Set(ciks)].slice(0, 25);
}
export const ingestEnabled = (env = process.env) => String(env.INSIDIR_13F_INGEST ?? "").trim() !== "0" && secReady();

export async function ingestManager(cik, { run = queryDb, fetcher = secFetch, connect, maxFilings = 6 } = {}) {
  const id = cik10(cik);
  if (!id) throw fail(400, "Invalid CIK");
  await run("INSERT INTO form13f_managers(cik) VALUES($1) ON CONFLICT DO NOTHING", [id]);
  try {
    const subs = await fetcher("https://data.sec.gov/submissions/CIK" + id + ".json", { json: true });
    const name = typeof subs?.name === "string" ? subs.name.slice(0, 200) : null;
    const filings = thirteenFFilings(subs, maxFilings);
    if (!filings.length) {
      await run("UPDATE form13f_managers SET name=COALESCE($2,name),status='no_13f',last_checked_at=now(),error=NULL WHERE cik=$1", [id, name]);
      return { cik: id, name, status: "no_13f", stored: 0 };
    }
    const known = new Set((await run("SELECT accession FROM form13f_filings WHERE accession=ANY($1::text[])", [filings.map(f => f.accession)])).rows.map(r => r.accession));
    let stored = 0, notices = 0; const errors = [];
    for (const f of filings) {
      if (known.has(f.accession)) continue;
      try {
        const got = await fetchFiling(id, f, fetcher);
        if (got.notice) { notices++; continue; }
        if (await storeFiling(id, f, got, connect)) stored++;
      } catch (e) { errors.push(f.accessionDashed + ": " + String(e?.message || e).slice(0, 120)); }
    }
    const any = (await run("SELECT 1 FROM form13f_filings WHERE manager_cik=$1 LIMIT 1", [id])).rowCount > 0;
    await run("UPDATE form13f_managers SET name=COALESCE($2,name),status=$3,last_checked_at=now(),error=$4 WHERE cik=$1",
      [id, name, any ? "ok" : errors.length ? "error" : "no_13f", errors.length ? errors.join("; ").slice(0, 500) : null]);
    return { cik: id, name, status: any ? "ok" : "error", stored, notices, errors };
  } catch (e) {
    await run("UPDATE form13f_managers SET status=CASE WHEN status='ok' THEN 'ok' ELSE 'error' END,last_checked_at=now(),error=$2 WHERE cik=$1", [id, String(e?.message || e).slice(0, 300)]);
    return { cik: id, status: "error", stored: 0, errors: [String(e?.message || e)] };
  }
}

let busy = false;
export async function form13fTick({ run = queryDb, env = process.env, fetcher = secFetch, connect } = {}) {
  if (busy) return { skipped: "running" };
  if (!ingestEnabled(env)) return { skipped: "disabled" };
  busy = true;
  const job = (await run("INSERT INTO intelligence_jobs(job) VALUES('form13f_ingest') RETURNING id")).rows[0].id;
  try {
    const results = [];
    for (const cik of managerCiks(env)) results.push(await ingestManager(cik, { run, fetcher, connect }));
    const failed = results.filter(r => r.status === "error").length;
    const detail = { managers: results.length, stored: results.reduce((s, r) => s + (r.stored || 0), 0), failed };
    await run("UPDATE intelligence_jobs SET finished_at=now(),status=$2,detail=$3::jsonb,error=$4 WHERE id=$1",
      [job, failed && failed === results.length ? "failed" : "ok", JSON.stringify(detail), failed ? results.filter(r => r.errors?.length).map(r => r.cik + ": " + r.errors[0]).join("; ").slice(0, 500) : null]);
    return { ...detail, results };
  } catch (e) {
    await run("UPDATE intelligence_jobs SET finished_at=now(),status='failed',error=$2 WHERE id=$1", [job, String(e?.message || e).slice(0, 500)]);
    throw e;
  } finally { busy = false; }
}
