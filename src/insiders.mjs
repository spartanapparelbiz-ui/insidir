/* Live insider activity for any SEC issuer, read from the issuer's own recent Form 4
 * filings (EDGAR submissions → ownership XML). Values are what the filer reported:
 * share counts, prices and codes are never estimated beyond shares × reported price. */
import { secFetch, parseOwnership } from "./sec.mjs";
import { createCache } from "./cache.mjs";
import { resolveCompany } from "./intelligence.mjs";

const documents = createCache(1500); // Filed ownership documents never change.
const summaries = createCache(200);
const DOC_TTL = 24 * 60 * 60 * 1000;
const SUMMARY_TTL = 15 * 60 * 1000;
const accessionOk = value => typeof value === "string" && /^\d{10}-\d{2}-\d{6}$/.test(value);
const isDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const TRANSACTION_CODES = Object.freeze({
  P: "Open-market purchase", S: "Open-market sale", A: "Grant or award", M: "Option exercise",
  F: "Tax withholding", G: "Gift", D: "Disposition to issuer", C: "Conversion", X: "Option exercise",
  J: "Other acquisition or disposition", V: "Voluntary report", W: "Inheritance", I: "Discretionary transaction",
  L: "Small acquisition", K: "Equity swap", Z: "Voting trust", E: "Expiration of short position", H: "Expiration of long position",
  O: "Out-of-the-money exercise", U: "Tender of shares"
});

/* EDGAR lists the styled rendering ("xslF345X06/form4.xml"); the raw XML sits beside it. */
export function ownershipUrls(cik, accession, primaryDocument) {
  if (!/^\d{10}$/.test(cik) || !accessionOk(accession) || typeof primaryDocument !== "string") return null;
  const match = /^(?:(xsl[A-Za-z0-9]+)\/)?([A-Za-z0-9][A-Za-z0-9._-]{0,149}\.xml)$/.exec(primaryDocument);
  if (!match) return null;
  const base = "https://www.sec.gov/Archives/edgar/data/" + Number(cik) + "/" + accession.replace(/-/g, "") + "/";
  return { xmlUrl: base + match[2], viewUrl: base + primaryDocument, indexUrl: base + accession + "-index.html" };
}

export function recentOwnershipFilings(submissions, cik, limit = 16) {
  const recent = submissions?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) return [];
  const out = [];
  for (let i = 0; i < recent.form.length && out.length < limit; i++) {
    const form = recent.form[i];
    if (form !== "4" && form !== "4/A") continue;
    const accession = recent.accessionNumber?.[i], filedAt = recent.filingDate?.[i];
    const urls = ownershipUrls(cik, accession, recent.primaryDocument?.[i]);
    if (!urls || !isDate(filedAt)) continue;
    out.push({ form, accession, filedAt, ...urls });
  }
  return out;
}

export function ownerRole(owner) {
  if (!owner) return null;
  const parts = [];
  if (owner.isOfficer && owner.officerTitle) parts.push(owner.officerTitle);
  else if (owner.isOfficer) parts.push("Officer");
  if (owner.isDirector) parts.push("Director");
  if (owner.isTenPercentOwner) parts.push("10% owner");
  if (!parts.length && owner.otherText) parts.push(owner.otherText);
  return parts.length ? parts.join(" · ").replace(/\s+/g, " ").slice(0, 120) : null;
}

/* One row per ownership filing: net non-derivative shares and reported value. */
export function summarizeOwnershipFiling(parsed, filing) {
  const owner = parsed.owners.length === 1 ? parsed.owners[0] : parsed.owners[0] || null;
  const rows = parsed.transactions.map(t => ({
    date: t.transactionDate, code: t.code, label: TRANSACTION_CODES[t.code] || "Reported transaction",
    acquiredDisposed: t.acquiredDisposed, derivative: t.derivative, security: t.securityTitle,
    shares: t.shares, price: t.pricePerShare, value: t.estimatedValue, sharesAfter: t.sharesAfter ?? null,
    category: t.category
  }));
  const equity = rows.filter(r => !r.derivative && Number.isFinite(r.shares));
  // Open-market trades (P/S) define the headline when present; otherwise every equity line counts.
  const trades = equity.filter(r => r.code === "P" || r.code === "S");
  const counted = trades.length ? trades : equity;
  const signed = r => r.acquiredDisposed === "D" ? -r.shares : r.shares;
  const netShares = counted.reduce((sum, r) => sum + signed(r), 0);
  const value = counted.reduce((sum, r) => sum + (Number.isFinite(r.value) && r.price > 0 ? r.value : 0), 0);
  const primary = trades[0] || equity[0] || rows[0] || null;
  const dates = rows.map(r => r.date).filter(isDate).sort();
  const buys = trades.some(r => r.code === "P"), sells = trades.some(r => r.code === "S");
  const kind = buys && !sells ? "purchase" : sells && !buys ? "sale" : buys && sells ? "mixed"
    : netShares > 0 ? "acquisition" : netShares < 0 ? "disposition" : "other";
  return {
    accession: filing.accession, form: filing.form, filedAt: filing.filedAt,
    transactionDate: dates.at(-1) || null,
    owner: { name: owner?.name || "Reporting person", cik: owner?.cik || null, role: ownerRole(owner),
      isDirector: Boolean(owner?.isDirector), isOfficer: Boolean(owner?.isOfficer), isTenPercentOwner: Boolean(owner?.isTenPercentOwner) },
    additionalOwners: parsed.owners.slice(1).map(o => o.name).slice(0, 4),
    kind, code: primary?.code || null, codeLabel: primary?.label || null,
    netShares: counted.length ? netShares : null, value: value > 0 ? Math.round(value * 100) / 100 : null,
    sharesAfter: [...equity].reverse().find(r => Number.isFinite(r.sharesAfter))?.sharesAfter ?? null,
    transactions: rows.slice(0, 30),
    sourceUrl: filing.viewUrl, xmlUrl: filing.xmlUrl
  };
}

export function summarizePeople(activity) {
  const people = new Map();
  for (const item of activity) {
    const key = item.owner.cik || item.owner.name.toUpperCase();
    const person = people.get(key) || { name: item.owner.name, cik: item.owner.cik, role: item.owner.role,
      isDirector: item.owner.isDirector, isOfficer: item.owner.isOfficer, filings: 0, netShares: 0, value: 0,
      lastFiled: item.filedAt, lastTransaction: item.transactionDate, sharesAfter: item.sharesAfter };
    person.filings += 1;
    person.netShares += item.netShares || 0;
    person.value += item.value || 0;
    if (!person.role && item.owner.role) person.role = item.owner.role;
    people.set(key, person);
  }
  return [...people.values()].sort((a, b) => b.lastFiled.localeCompare(a.lastFiled) || b.filings - a.filings);
}

export async function getCompanyInsiders(ticker, { limit = 16, fetcher = secFetch } = {}) {
  const resolved = await resolveCompany(ticker, fetcher);
  if (!resolved) return null;
  const { company, submissions } = resolved;
  const work = async () => {
    const filings = recentOwnershipFilings(submissions, company.cik, limit);
    const settled = await Promise.allSettled(filings.map(filing =>
      documents(filing.xmlUrl, DOC_TTL, async () => parseOwnership(await fetcher(filing.xmlUrl), { accession: filing.accession, sourceUrl: filing.viewUrl, formType: filing.form, publishedAt: filing.filedAt }))
        .then(parsed => ({ parsed, filing }))));
    const activity = [];
    let failed = 0, otherIssuer = 0;
    for (const result of settled) {
      if (result.status !== "fulfilled") { failed++; continue; }
      const { parsed, filing } = result.value;
      // An issuer's EDGAR feed also lists filings where the company itself is the reporting owner.
      if (String(Number(parsed.issuerCik)) !== String(Number(company.cik))) { otherIssuer++; continue; }
      activity.push(summarizeOwnershipFiling(parsed, filing));
    }
    activity.sort((a, b) => b.filedAt.localeCompare(a.filedAt) || String(b.transactionDate || "").localeCompare(String(a.transactionDate || "")));
    return {
      company, activity, people: summarizePeople(activity),
      coverage: { requested: filings.length, parsed: activity.length, failed, excludedOtherIssuer: otherIssuer },
      source: { name: "SEC EDGAR Form 4 ownership filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + company.cik + "&type=4&owner=include&count=40" },
      retrievedAt: new Date().toISOString()
    };
  };
  return fetcher === secFetch ? summaries("insiders:" + company.cik + ":" + limit, SUMMARY_TTL, work) : work();
}
