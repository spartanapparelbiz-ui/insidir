/* Read-only SEC reporting-owner archive fallback. Used only when a person has no
 * locally imported Form 4 records. Does not pretend that an index entry is a
 * parsed transaction, and does not assume an unrelated CIK is an individual.
 *
 * The SEC submissions API's recent arrays include filings by reporting owners;
 * this is not a global people directory and some histories require older files.
 * Cache successful owner lookup so repeated requests do not overload EDGAR. */
import { secFetch } from "./sec.mjs";
import { createCache } from "./cache.mjs";

const cache = createCache(200);
const FORMS = new Set(["3","3/A","4","4/A","5","5/A"]);
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const HISTORY_LIMIT = 100;

export function normalizeSecOwnerIndex(data, cik, limit = HISTORY_LIMIT) {
  const id = String(cik || "").replace(/^0+/, "");
  if (!/^\d{1,10}$/.test(id) || !id || !data || typeof data !== "object") return null;
  if (data.cik == null || String(data.cik).replace(/^0+/,"") !== id) return null;
  const recent = data.filings?.recent;
  if (!recent || !Array.isArray(recent.form) || !Array.isArray(recent.accessionNumber)) return null;
  const entries = [], seen = new Set();
  for (let i=0; i<recent.form.length && entries.length<Math.max(1,Math.min(HISTORY_LIMIT,limit)); i++) {
    const form=String(recent.form[i]||"").toUpperCase().trim();
    const accession=String(recent.accessionNumber[i]||"");
    const filingDate=String(recent.filingDate?.[i]||"");
    if (!FORMS.has(form)||!ACCESSION.test(accession)||!DATE.test(filingDate)||seen.has(accession))continue;
    seen.add(accession);
    const reportDate=String(recent.reportDate?.[i]||"");
    entries.push({form_type:form,accession, filed_at:filingDate,
      report_date:DATE.test(reportDate)?reportDate:null});
  }
  if(!entries.length)return null;
  const padded=id.padStart(10,"0");
  const name=typeof data.name==="string"?data.name.trim().slice(0,150):"";
  return {
    coverage:"sec_submissions_history_only",
    person:{cik:padded,name:name||"SEC reporting filer "+padded,filed_names:name?[name]:[]},
    source:"SEC EDGAR submissions index",
    source_url:"https://data.sec.gov/submissions/CIK"+padded+".json",
    edgar_url:"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK="+padded+"&type=4&dateb=&owner=include&count=40",
    sec_filing_index:entries,
    history_partial:Boolean(data.filings.files?.length)||recent.form.length>entries.length,
    disclaimer:"Ownership filing index only. This is not a parsed Form 4 transaction record, financial advice or a complete statement of holdings."
  };
}

export async function fetchSecOwnerHistory(cik,{fetcher=secFetch,limit=HISTORY_LIMIT}={}) {
  const id=String(cik||"").trim().replace(/^0+/,"");
  if (!/^\d{1,10}$/.test(id)||!id)return null;
  const padded=id.padStart(10,"0");
  const work=async()=>normalizeSecOwnerIndex(
    await fetcher("https://data.sec.gov/submissions/CIK"+padded+".json",{json:true}),id,limit);
  return fetcher===secFetch?cache("sec-owner-index:"+padded,15*60_000,work):work();
}
